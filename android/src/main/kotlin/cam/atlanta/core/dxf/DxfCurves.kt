package cam.atlanta.core.dxf

import cam.atlanta.core.geometry.LineSegment
import cam.atlanta.core.geometry.Point2
import cam.atlanta.core.geometry.Segment2
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.sin
import kotlin.math.sqrt

private const val EPSILON = 1e-8
private const val CURVE_SEGMENT_LIMIT = 10_000
private const val SPLINE_SUBDIVISION_DEPTH = 18
private const val SPLINE_VECTOR_ERROR =
  "Для SPLINE нужны полные контрольные точки и узловой вектор. Сохраните сплайн как полилинию."

/** Samples an ellipse in source coordinates. The tolerance is expressed in the same units. */
internal fun sampleDxfEllipse(
  center: Point2,
  major: Point2,
  ratio: Double,
  start: Double,
  end: Double,
  tolerance: Double,
): List<Segment2> {
  val majorLength = hypot(major.x, major.y)
  val sweep = end - start
  require(center.x.isFinite() && center.y.isFinite() && majorLength.isFinite() && majorLength > 0.0 &&
    ratio > 0.0 && ratio <= 1.0 && sweep.isFinite() && tolerance.isFinite() && tolerance > 0.0
  ) { "Некорректный ELLIPSE." }
  val minor = Point2(-major.y * ratio, major.x * ratio)
  val step = maxOf(0.001, sqrt(8 * tolerance / majorLength))
  val count = ceil(abs(sweep) / step).toInt().coerceIn(12, CURVE_SEGMENT_LIMIT)

  fun point(parameter: Double): Point2 {
    val cosine = cos(parameter)
    val sine = sin(parameter)
    return Point2(
      center.x + (major.x * cosine + minor.x * sine),
      center.y + (major.y * cosine + minor.y * sine),
    )
  }

  var previous = point(start)
  return List(count) { index ->
    val next = point(start + sweep * (index + 1) / count)
    LineSegment(previous, next).also { previous = next }
  }
}

private data class ControlPoint(val x: Double, var y: Double = 0.0)

/** Samples a rational DXF spline with adaptive chord subdivision over each distinct knot interval. */
internal fun sampleDxfSpline(
  groups: List<Pair<Int, String>>,
  degree: Int,
  closed: Boolean,
  tolerance: Double,
): List<Segment2> {
  require(degree in 1..10) { SPLINE_VECTOR_ERROR }
  require(tolerance.isFinite() && tolerance > 0.0) { "Неверный допуск аппроксимации SPLINE." }
  val controls = mutableListOf<ControlPoint>()
  val knotValues = mutableListOf<Double>()
  val weightValues = mutableListOf<Double>()

  for ((code, value) in groups) {
    when (code) {
      10 -> controls.add(ControlPoint(splineNumber(code, value)))
      20 -> {
        val control = requireNotNull(controls.lastOrNull()) { SPLINE_VECTOR_ERROR }
        control.y = splineNumber(code, value)
      }
      30 -> {
        require(controls.isNotEmpty()) { SPLINE_VECTOR_ERROR }
        require(abs(splineNumber(code, value)) <= EPSILON) { "SPLINE вне плоскости XY." }
      }
      40 -> knotValues.add(splineNumber(code, value))
      41 -> weightValues.add(splineNumber(code, value))
    }
  }

  require(controls.size >= degree + 1 && knotValues.size == controls.size + degree + 1 &&
    weightValues.size <= controls.size
  ) { SPLINE_VECTOR_ERROR }
  val knots = knotValues.toDoubleArray()
  require((1..knots.lastIndex).all { knots[it] >= knots[it - 1] } &&
    knots[controls.size] > knots[degree] && (knots.last() - knots.first()).isFinite()
  ) { SPLINE_VECTOR_ERROR }

  return SplineSampler(controls, knots, weightValues.toDoubleArray(), degree, tolerance).sample(closed)
}

private fun splineNumber(code: Int, value: String): Double =
  value.toDoubleOrNull()?.takeIf(Double::isFinite)
    ?: throw IllegalArgumentException("Некорректное число SPLINE в группе $code.")

private class SplineSampler(
  private val controls: List<ControlPoint>,
  private val knots: DoubleArray,
  private val weights: DoubleArray,
  private val degree: Int,
  private val tolerance: Double,
) {
  private val x = DoubleArray(degree + 1)
  private val y = DoubleArray(degree + 1)
  private val w = DoubleArray(degree + 1)
  private val segments = mutableListOf<LineSegment>()

  fun sample(closed: Boolean): List<Segment2> {
    var start = knots[degree]
    var startPoint = evaluate(start)
    for (index in degree + 1..controls.size) {
      val end = knots[index]
      if (end == start) continue
      val endPoint = evaluate(end)
      subdivide(start, end, startPoint, endPoint, depth = 0)
      start = end
      startPoint = endPoint
    }

    if (closed) {
      val first = segments.first().start
      val last = segments.last().end
      if (hypot(first.x - last.x, first.y - last.y) > tolerance) segments.add(LineSegment(last, first))
    }
    return segments
  }

  private fun evaluate(parameter: Double): Point2 {
    val spanStart = findSpan(parameter) - degree
    for (index in 0..degree) {
      val controlIndex = spanStart + index
      val weight = weights.getOrElse(controlIndex) { 1.0 }
      x[index] = controls[controlIndex].x * weight
      y[index] = controls[controlIndex].y * weight
      w[index] = weight
    }

    // Rational de Boor interpolation in homogeneous coordinates.
    for (order in 1..degree) {
      for (index in degree downTo order) {
        val knotIndex = spanStart + index
        val width = knots[knotIndex + degree - order + 1] - knots[knotIndex]
        val alpha = if (width == 0.0) 0.0 else (parameter - knots[knotIndex]) / width
        val beta = 1 - alpha
        x[index] = beta * x[index - 1] + alpha * x[index]
        y[index] = beta * y[index - 1] + alpha * y[index]
        w[index] = beta * w[index - 1] + alpha * w[index]
      }
    }

    val mass = w[degree]
    require(mass.isFinite() && abs(mass) >= EPSILON) { "Некорректная рациональная масса SPLINE." }
    val point = Point2(x[degree] / mass, y[degree] / mass)
    require(point.x.isFinite() && point.y.isFinite()) { "В SPLINE есть неверные координаты." }
    return point
  }

  private fun findSpan(parameter: Double): Int {
    var low = degree
    var high = controls.lastIndex
    while (low < high) {
      val middle = low + (high - low) / 2
      if (parameter >= knots[middle + 1]) low = middle + 1 else high = middle
    }
    return low
  }

  private fun subdivide(start: Double, end: Double, from: Point2, to: Point2, depth: Int) {
    val width = end - start
    val sum = start + end
    val middle = if (sum.isFinite()) sum / 2 else start + width / 2
    val midpoint = evaluate(middle)
    val firstQuarter = evaluate(start + width * 0.25)
    val lastQuarter = evaluate(start + width * 0.75)
    val chord = LineSegment(from, to)
    if (depth < SPLINE_SUBDIVISION_DEPTH && maxOf(
        chord.distanceTo(midpoint), chord.distanceTo(firstQuarter), chord.distanceTo(lastQuarter),
      ) > tolerance
    ) {
      subdivide(start, middle, from, midpoint, depth + 1)
      subdivide(middle, end, midpoint, to, depth + 1)
    } else {
      require(segments.size < CURVE_SEGMENT_LIMIT) { "Сплайн слишком сложный." }
      segments.add(chord)
    }
  }
}
