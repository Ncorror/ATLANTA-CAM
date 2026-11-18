package cam.atlanta.core.geometry

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.acos
import kotlin.math.atan
import kotlin.math.atan2
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.sign
import kotlin.math.sin
import kotlin.math.sqrt

private const val TAU = 2 * PI
private const val EPS = 1e-8

data class Point2(val x: Double, val y: Double)

data class Bounds2(val minX: Double, val minY: Double, val maxX: Double, val maxY: Double)

sealed interface Segment2 {
  val start: Point2
  val end: Point2
  val length: Double

  fun pointAt(fraction: Double): Point2
  fun tangent(atEnd: Boolean = false): Point2
  fun reversed(): Segment2
  fun sample(tolerance: Double = 0.03): List<Point2>
  fun distanceTo(point: Point2): Double
}

data class LineSegment(override val start: Point2, override val end: Point2) : Segment2 {
  override val length: Double get() = start.distanceTo(end)

  override fun pointAt(fraction: Double): Point2 = start + (end - start) * fraction

  override fun tangent(atEnd: Boolean): Point2 = (end - start).unit()

  override fun reversed(): LineSegment = LineSegment(end, start)

  override fun sample(tolerance: Double): List<Point2> = listOf(start, end)

  override fun distanceTo(point: Point2): Double {
    val direction = end - start
    val fraction = ((point - start).dot(direction) / direction.dot(direction).nonZeroOrOne())
      .coerceIn(0.0, 1.0)
    return point.distanceTo(start + direction * fraction)
  }
}

/** Positive sweeps turn counterclockwise in the drawing plane. */
data class ArcSegment(
  override val start: Point2,
  override val end: Point2,
  val center: Point2,
  val sweep: Double,
) : Segment2 {
  val radius: Double = start.distanceTo(center)
  private val startAngle = center.angleTo(start)

  override val length: Double get() = radius * abs(sweep)

  override fun pointAt(fraction: Double): Point2 = center + polar(radius, startAngle + sweep * fraction)

  override fun tangent(atEnd: Boolean): Point2 {
    val endpoint = if (atEnd) end else start
    return (endpoint - center).unit().left() * sign(sweep)
  }

  override fun reversed(): ArcSegment = ArcSegment(end, start, center, -sweep)

  override fun sample(tolerance: Double): List<Point2> {
    val toleranceAngle = 2 * acos((1 - tolerance / radius.nonZeroOrOne()).coerceIn(-1.0, 1.0))
    val step = toleranceAngle.coerceIn(0.002, PI / 12)
    val count = ceil(abs(sweep) / step).coerceIn(2.0, 10_000.0)
    return List((count + 1).toInt()) { pointAt(it / count) }
  }

  override fun distanceTo(point: Point2): Double {
    val angle = directedSweep(startAngle, center.angleTo(point), sign(sweep))
    if (abs(sweep) > TAU - EPS || abs(angle) <= abs(sweep) + EPS) {
      return abs(point.distanceTo(center) - radius)
    }
    return minOf(point.distanceTo(start), point.distanceTo(end))
  }
}

fun arcThroughPoints(start: Point2, through: Point2, end: Point2): ArcSegment? {
  if (!start.isFinite() || !through.isFinite() || !end.isFinite()) return null

  // Solve in a normalized coordinate system with the start point at the origin.
  val throughChord = through - start
  val endChord = end - start
  val scale = maxOf(abs(throughChord.x), abs(throughChord.y), abs(endChord.x), abs(endChord.y))
  if (scale == 0.0 || !scale.isFinite()) return null
  val u = Point2(throughChord.x / scale, throughChord.y / scale)
  val v = Point2(endChord.x / scale, endChord.y / scale)
  val uu = u.dot(u)
  val vv = v.dot(v)
  val determinant = 2 * u.cross(v)
  if (uu == 0.0 || vv == 0.0 || u.distanceTo(v) == 0.0 ||
    abs(determinant) <= Math.ulp(1.0) * 32 * sqrt(uu * vv)
  ) return null

  val normalizedCenter = Point2(
    (uu * v.y - vv * u.y) / determinant,
    (u.x * vv - v.x * uu) / determinant,
  )
  val center = start + normalizedCenter * scale
  val radius = normalizedCenter.length() * scale
  if (!center.isFinite() || !radius.isFinite() || radius == 0.0) return null

  val startAngle = atan2(-normalizedCenter.y, -normalizedCenter.x)
  val throughAngle = normalizedCenter.angleTo(u)
  val endAngle = normalizedCenter.angleTo(v)
  val counterclockwiseSweep = positiveAngle(endAngle - startAngle)
  val sweep = if (positiveAngle(throughAngle - startAngle) > counterclockwiseSweep + 1e-12) {
    counterclockwiseSweep - TAU
  } else {
    counterclockwiseSweep
  }
  return if (sweep == 0.0) null else ArcSegment(start, end, center, sweep)
}

fun segmentFromBulge(start: Point2, end: Point2, bulge: Double): Segment2 {
  if (abs(bulge) < 1e-10) return LineSegment(start, end)
  val chord = end - start
  require(chord.length() >= EPS) { "Дуга bulge с совпадающими вершинами." }
  val center = (start + end) * 0.5 + chord.left() * ((1 - bulge * bulge) / (4 * bulge))
  return ArcSegment(start, end, center, 4 * atan(bulge))
}

fun flattenSegments(segments: List<Segment2>, tolerance: Double = 0.03): List<Point2> = buildList {
  for (segment in segments) {
    val points = segment.sample(tolerance)
    val sharesEndpoint = isNotEmpty() && points.isNotEmpty() && last().distanceTo(points.first()) < EPS
    addAll(if (sharesEndpoint) points.subList(1, points.size) else points)
  }
}

fun signedArea(segments: List<Segment2>): Double {
  var doubledArea = 0.0
  for (segment in segments) {
    doubledArea += segment.start.cross(segment.end)
    if (segment is ArcSegment) {
      doubledArea += segment.radius * segment.radius * (segment.sweep - sin(segment.sweep))
    }
  }
  return doubledArea / 2
}

fun segmentBounds(segments: List<Segment2>): Bounds2 {
  if (segments.isEmpty()) return Bounds2(-20.0, -20.0, 20.0, 20.0)

  var minX = Double.POSITIVE_INFINITY
  var minY = Double.POSITIVE_INFINITY
  var maxX = Double.NEGATIVE_INFINITY
  var maxY = Double.NEGATIVE_INFINITY
  fun include(point: Point2) {
    minX = minOf(minX, point.x)
    minY = minOf(minY, point.y)
    maxX = maxOf(maxX, point.x)
    maxY = maxOf(maxY, point.y)
  }

  for (segment in segments) {
    include(segment.start)
    include(segment.end)
    if (segment is ArcSegment) {
      val startAngle = segment.center.angleTo(segment.start)
      for (quadrant in 0..3) {
        val angle = quadrant * PI / 2
        val sweep = directedSweep(startAngle, angle, sign(segment.sweep))
        if (abs(segment.sweep) >= TAU - EPS ||
          abs(sweep) <= abs(segment.sweep) + EPS || abs(angle - startAngle) < EPS
        ) include(segment.center + polar(segment.radius, angle))
      }
    }
  }
  return Bounds2(minX, minY, maxX, maxY)
}

private fun directedSweep(start: Double, end: Double, direction: Double): Double {
  var delta = end - start
  if (direction > 0) {
    while (delta <= EPS) delta += TAU
  } else {
    while (delta >= -EPS) delta -= TAU
  }
  return delta
}

private fun positiveAngle(angle: Double): Double = ((angle % TAU) + TAU) % TAU
private fun polar(radius: Double, angle: Double): Point2 = Point2(radius * cos(angle), radius * sin(angle))
private fun Double.nonZeroOrOne(): Double = if (this == 0.0 || isNaN()) 1.0 else this
private operator fun Point2.plus(other: Point2): Point2 = Point2(x + other.x, y + other.y)
private operator fun Point2.minus(other: Point2): Point2 = Point2(x - other.x, y - other.y)
private operator fun Point2.times(scale: Double): Point2 = Point2(x * scale, y * scale)
private fun Point2.dot(other: Point2): Double = x * other.x + y * other.y
private fun Point2.cross(other: Point2): Double = x * other.y - y * other.x
private fun Point2.left(): Point2 = Point2(-y, x)
private fun Point2.length(): Double = hypot(x, y)
private fun Point2.distanceTo(other: Point2): Double = (this - other).length()
private fun Point2.unit(): Point2 = this * (1 / length().nonZeroOrOne())
private fun Point2.angleTo(other: Point2): Double = atan2(other.y - y, other.x - x)
private fun Point2.isFinite(): Boolean = x.isFinite() && y.isFinite()
