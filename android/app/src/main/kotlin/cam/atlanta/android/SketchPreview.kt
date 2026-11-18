package cam.atlanta.android

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.view.View
import cam.atlanta.core.geometry.ArcSegment
import cam.atlanta.core.geometry.Bounds2
import cam.atlanta.core.geometry.Contour2
import cam.atlanta.core.geometry.ContourAssembly
import cam.atlanta.core.geometry.LineSegment
import cam.atlanta.core.geometry.Point2
import cam.atlanta.core.geometry.Segment2
import cam.atlanta.core.geometry.segmentBounds
import cam.atlanta.core.project.SketchScene
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.log10
import kotlin.math.pow
import kotlin.math.tan

class SketchPreview(context: Context) : View(context) {
  private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    style = Paint.Style.STROKE
    strokeCap = Paint.Cap.ROUND
    strokeJoin = Paint.Join.ROUND
  }
  private val planPath = Path()
  private val machiningPath = Path()
  private var plan = emptyList<Segment2>()
  private var machining = emptyList<Segment2>()
  private var drillCenters = emptyList<Point2>()
  private var bounds = segmentBounds(emptyList())
  private var viewport: Viewport? = null

  init {
    importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES
    contentDescription = "Геометрия эскиза отсутствует"
  }

  fun show(scene: SketchScene?) {
    val planContours = scene?.plan?.contours.orEmpty()
    val machiningContours = scene?.machining?.contours.orEmpty()
    val centers = scene?.drillCenters.orEmpty()
    val description = if (planContours.isEmpty() && machiningContours.isEmpty() && centers.isEmpty()) {
      "Геометрия эскиза отсутствует"
    } else {
      "Предпросмотр эскиза. Контуров на плане ${planContours.size}, в операции ${machiningContours.size}. " +
        "Точек сверления ${centers.size}."
    }
    showGeometry(planContours, machiningContours, centers, description)
  }

  fun showDxf(drawing: ContourAssembly) {
    showGeometry(drawing.contours, emptyList(), emptyList(), "Предпросмотр DXF. Контуров: ${drawing.contours.size}.")
  }

  private fun showGeometry(
    planContours: List<Contour2>,
    machiningContours: List<Contour2>,
    centers: List<Point2>,
    description: String,
  ) {
    plan = planContours.flatMap { it.segments }
    machining = machiningContours.flatMap { it.segments }
    drillCenters = centers
    bounds = drawingBounds(plan + machining, centers)
    contentDescription = description
    updatePaths()
    invalidate()
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    updatePaths()
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    canvas.drawColor(SURFACE)
    val frame = viewport ?: return
    drawGrid(canvas, frame)
    paint.color = PLAN
    paint.strokeWidth = dp(1.4f)
    canvas.drawPath(planPath, paint)
    paint.color = MACHINING
    paint.strokeWidth = dp(2.6f)
    canvas.drawPath(machiningPath, paint)
    paint.color = DRILL
    paint.strokeWidth = dp(1.8f)
    for (point in drillCenters) {
      val x = frame.x(point.x)
      val y = frame.y(point.y)
      val radius = dp(4.5f)
      val cross = dp(7f)
      canvas.drawCircle(x, y, radius, paint)
      canvas.drawLine(x - cross, y, x + cross, y, paint)
      canvas.drawLine(x, y - cross, x, y + cross, paint)
    }
  }

  private fun updatePaths() {
    planPath.rewind()
    machiningPath.rewind()
    viewport = null
    if (width == 0 || height == 0) return
    val inset = minOf(dp(24f).toDouble(), minOf(width, height) * 0.10)
    val frame = Viewport(
      (bounds.minX + bounds.maxX) / 2.0,
      (bounds.minY + bounds.maxY) / 2.0,
      width / 2.0,
      height / 2.0,
      minOf(
        (width - 2 * inset) / (bounds.maxX - bounds.minX).coerceAtLeast(0.001),
        (height - 2 * inset) / (bounds.maxY - bounds.minY).coerceAtLeast(0.001),
      ),
    )
    viewport = frame
    addSegments(planPath, plan, frame)
    addSegments(machiningPath, machining, frame)
  }

  private fun addSegments(path: Path, segments: List<Segment2>, frame: Viewport) {
    for (segment in segments) {
      path.moveTo(frame.x(segment.start.x), frame.y(segment.start.y))
      when (segment) {
        is LineSegment -> path.lineTo(frame.x(segment.end.x), frame.y(segment.end.y))
        is ArcSegment -> addArc(path, segment, frame)
      }
    }
  }

  private fun addArc(path: Path, arc: ArcSegment, frame: Viewport) {
    // Cubic pieces preserve sketch endpoints and avoid passing a huge off-screen circle to Canvas.
    val pieces = ceil(abs(arc.sweep) / (PI / 4)).toInt().coerceAtLeast(1)
    val tangentScale = (4.0 / 3) * tan(arc.sweep / pieces / 4)
    var start = arc.start
    for (piece in 1..pieces) {
      val end = if (piece == pieces) arc.end else arc.pointAt(piece.toDouble() / pieces)
      val firstX = start.x - (start.y - arc.center.y) * tangentScale
      val firstY = start.y + (start.x - arc.center.x) * tangentScale
      val secondX = end.x + (end.y - arc.center.y) * tangentScale
      val secondY = end.y - (end.x - arc.center.x) * tangentScale
      path.cubicTo(frame.x(firstX), frame.y(firstY), frame.x(secondX), frame.y(secondY), frame.x(end.x), frame.y(end.y))
      start = end
    }
  }

  private fun drawGrid(canvas: Canvas, frame: Viewport) {
    val requestedStep = dp(26f) / frame.scale
    val power = 10.0.pow(floor(log10(requestedStep)))
    val step = when {
      requestedStep <= 2 * power -> 2 * power
      requestedStep <= 5 * power -> 5 * power
      else -> 10 * power
    }
    val spacing = step * frame.scale
    val zeroX = frame.x(0.0)
    val zeroY = frame.y(0.0)
    paint.color = GRID
    paint.strokeWidth = dp(1f)
    var x = frame.firstGridX(step)
    while (x < width) {
      canvas.drawLine(x.toFloat(), 0f, x.toFloat(), height.toFloat(), paint)
      x += spacing
    }
    var y = frame.firstGridY(step)
    while (y < height) {
      canvas.drawLine(0f, y.toFloat(), width.toFloat(), y.toFloat(), paint)
      y += spacing
    }
    paint.color = AXIS
    if (zeroX in 0f..width.toFloat()) canvas.drawLine(zeroX, 0f, zeroX, height.toFloat(), paint)
    if (zeroY in 0f..height.toFloat()) canvas.drawLine(0f, zeroY, width.toFloat(), zeroY, paint)
  }

  private fun dp(value: Float): Float = value * resources.displayMetrics.density

  private data class Viewport(
    val centerX: Double,
    val centerY: Double,
    val pixelX: Double,
    val pixelY: Double,
    val scale: Double,
  ) {
    fun x(worldX: Double): Float = (pixelX + (worldX - centerX) * scale).toFloat()
    fun y(worldY: Double): Float = (pixelY - (worldY - centerY) * scale).toFloat()

    fun firstGridX(step: Double): Double {
      val left = centerX - pixelX / scale
      return (ceil(left / step) * step - left) * scale
    }

    fun firstGridY(step: Double): Double {
      val top = centerY + pixelY / scale
      return (top - floor(top / step) * step) * scale
    }
  }

  private companion object {
    val SURFACE = 0xfff8fafd.toInt()
    val GRID = 0xffe5ebf4.toInt()
    val AXIS = 0xffc6d2e2.toInt()
    val PLAN = 0xff8494ab.toInt()
    val MACHINING = 0xff2459cb.toInt()
    val DRILL = 0xffae472b.toInt()

    fun drawingBounds(segments: List<Segment2>, centers: List<Point2>): Bounds2 {
      if (centers.isEmpty()) return segmentBounds(segments)
      val geometry = if (segments.isEmpty()) null else segmentBounds(segments)
      val minX = centers.minOf { it.x }
      val minY = centers.minOf { it.y }
      val maxX = centers.maxOf { it.x }
      val maxY = centers.maxOf { it.y }
      return Bounds2(
        minOf(minX, geometry?.minX ?: minX), minOf(minY, geometry?.minY ?: minY),
        maxOf(maxX, geometry?.maxX ?: maxX), maxOf(maxY, geometry?.maxY ?: maxY),
      )
    }
  }
}
