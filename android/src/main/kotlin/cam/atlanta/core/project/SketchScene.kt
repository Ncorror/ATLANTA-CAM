package cam.atlanta.core.project

import cam.atlanta.core.geometry.ArcSegment
import cam.atlanta.core.geometry.Bounds2
import cam.atlanta.core.geometry.Contour2
import cam.atlanta.core.geometry.ContourAssembly
import cam.atlanta.core.geometry.LineSegment
import cam.atlanta.core.geometry.Point2
import cam.atlanta.core.geometry.Segment2
import cam.atlanta.core.geometry.arcThroughPoints
import cam.atlanta.core.geometry.connectSegments
import cam.atlanta.core.geometry.segmentBounds
import cam.atlanta.core.geometry.signedArea
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.roundToLong
import kotlin.math.sign

data class SketchScene(
  val plan: ContourAssembly,
  val machining: ContourAssembly,
  val drillCenters: List<Point2>,
  val markedCount: Int,
)

/** Returns null when the project has no saved sketch, including projects with embedded DXF alone. */
fun ProjectV5.sketchScene(operation: ProjectOperation = activeOperation): SketchScene? {
  val sketch = json["sketch"] as? JsonObject ?: return null
  val rows = sketch["items"] as? JsonArray
    ?: throw IllegalArgumentException("Неверный список элементов эскиза.")
  require(rows.size <= SKETCH_ITEM_LIMIT) { "В эскизе допускается до $SKETCH_ITEM_LIMIT элементов." }

  val ids = mutableSetOf<String>()
  val ordinary = buildList {
    for (row in rows) {
      val item = readItem(row)
      require(ids.add(item.id)) { "Повторяется идентификатор элемента эскиза: ${item.id}." }
      if (!item.construction) add(item)
    }
  }
  val plan = connectSegments(ordinary.flatMap(SketchItem::segments))
  if (operation.kind == OperationKind.DRILL) {
    val centers = ordinary.filter { operation.id in it.drillOperations }.mapNotNull(SketchItem::circleCenter)
    return SketchScene(plan, emptyAssembly, centers, centers.size)
  }

  val marked = ordinary.filter { if (operation.id == "primary") it.machining else operation.id in it.millOperations }
  if (marked.isEmpty()) return SketchScene(plan, emptyAssembly, emptyList(), 0)
  val selected = if (marked.size == ordinary.size) plan else connectSegments(marked.flatMap(SketchItem::segments))
  return SketchScene(plan, describeMachining(plan, selected, ordinary), emptyList(), marked.size)
}

private const val SKETCH_ITEM_LIMIT = 10_000
private const val COORDINATE_LIMIT = 1_000_000.0
private const val MIN_SEGMENT_LENGTH = 0.001
private const val JUNCTION_TOLERANCE = 0.0005
private const val BOUNDARY_CHECK_LIMIT = 2_000_000
private const val OPEN_CONTOUR_WARNING =
  "Обработка отмечена по отдельным элементам. Проверь выбранные стенки и сторону обработки."
private val operationTag = Regex("o[1-9][0-9]{0,7}")
private val emptyAssembly = ContourAssembly(emptyList(), emptyList())

private data class SketchItem(
  val id: String,
  val segments: List<Segment2>,
  val circleCenter: Point2?,
  val construction: Boolean,
  val machining: Boolean,
  val millOperations: Set<String>,
  val drillOperations: Set<String>,
)

private fun readItem(row: JsonElement): SketchItem {
  require(row is JsonObject) { "Неизвестная или повреждённая геометрия в эскизе." }
  val id = row["id"].stringValue() ?: throw IllegalArgumentException("Нет идентификатора элемента эскиза.")
  val type = row["type"].stringValue()
  val construction = row.flag("construction", "Повреждён статус вспомогательного элемента.")
  val guide = row.flag("guide", "Повреждён статус бесконечной направляющей.")
  val machining = row.flag("machining", "Повреждена отметка обработки элемента.")
  val mill = row.operationTags("millOps")
  val drill = row.operationTags("drillOps")
  require(!guide || (construction && type == "line")) {
    "Бесконечная направляющая должна быть вспомогательной прямой."
  }
  require(!construction || !machining) { "Вспомогательная геометрия не может быть отмечена для обработки." }
  require((!construction || (mill.isEmpty() && drill.isEmpty())) && (type == "circle" || drill.isEmpty())) {
    "Недопустимое назначение операции элементу эскиза."
  }
  require(!row["unconfirmed"].isTruthy()) { "В эскизе есть неподтверждённые размеры элемента $id." }

  val segments: List<Segment2>
  var circleCenter: Point2? = null
  when (type) {
    "line", "arc" -> {
      val start = row.point("a", id)
      val end = row.point("b", id)
      require(hypot(end.x - start.x, end.y - start.y) > MIN_SEGMENT_LENGTH) {
        "Начало и конец элемента $id должны быть на расстоянии больше 0,001 мм."
      }
      segments = if (type == "line") listOf(LineSegment(start, end)) else {
        val arc = arcThroughPoints(start, row.point("m", id), end)
          ?: throw IllegalArgumentException("Три точки дуги $id лежат на одной прямой или совпадают.")
        listOf(arc)
      }
    }
    "circle" -> {
      val center = row.point("c", id)
      val radius = row["r"].numberValue()
      require(radius != null && radius > 0 && radius < COORDINATE_LIMIT) { "Повреждён радиус окружности $id." }
      circleCenter = center
      val right = Point2(center.x + radius, center.y)
      val left = Point2(center.x - radius, center.y)
      segments = listOf(ArcSegment(right, left, center, PI), ArcSegment(left, right, center, PI))
    }
    else -> throw IllegalArgumentException("Неизвестный тип элемента эскиза $id.")
  }
  return SketchItem(id, segments, circleCenter, construction, machining, mill, drill)
}

private fun JsonObject.flag(key: String, message: String): Boolean {
  val value = this[key] ?: return false
  require(value == JsonPrimitive(true) || value == JsonPrimitive(false)) { message }
  return value == JsonPrimitive(true)
}

private fun JsonObject.operationTags(key: String): Set<String> {
  val rows = this[key] ?: return emptySet()
  require(rows is JsonArray && rows.size <= 32) { "Повреждены отметки операций эскиза." }
  val tags = mutableSetOf<String>()
  for (row in rows) {
    val tag = row.stringValue()
    require(tag != null && operationTag.matches(tag) && tags.add(tag)) { "Повреждены отметки операций эскиза." }
  }
  return tags
}

private fun JsonObject.point(key: String, itemId: String): Point2 {
  val value = this[key] as? JsonObject
  val x = value?.get("x").numberValue()
  val y = value?.get("y").numberValue()
  require(x != null && y != null && abs(x) < COORDINATE_LIMIT && abs(y) < COORDINATE_LIMIT) {
    "Повреждены координаты элемента эскиза $itemId."
  }
  return Point2(x, y)
}

private fun JsonElement?.stringValue(): String? = (this as? JsonPrimitive)?.takeIf { it.isString }?.content

private fun JsonElement?.numberValue(): Double? = (this as? JsonPrimitive)?.takeUnless { it.isString }?.doubleOrNull

private fun JsonElement?.isTruthy(): Boolean = when (this) {
  null, JsonNull -> false
  is JsonPrimitive -> if (isString) content.isNotEmpty() else content == "true" ||
    doubleOrNull?.let { it != 0.0 && !it.isNaN() } == true
  else -> true
}

private fun describeMachining(
  plan: ContourAssembly,
  selected: ContourAssembly,
  ordinary: List<SketchItem>,
): ContourAssembly {
  val closed = plan.contours.filter { it.closed && !it.ambiguous }
  val closedPlan = closed.associateBy(::geometryKey)
  val boundaryLookup = BoundaryLookup(closed)
  val junctions = junctionPoints(ordinary)
  var incomplete = false
  val contours = selected.contours.map { contour ->
    val full = if (contour.closed && !contour.ambiguous) closedPlan[geometryKey(contour)] else null
    val preserve = hasJunction(contour, junctions)
    if (full != null) {
      contour.copy(nesting = full.nesting, autoSide = full.autoSide, preserveJunctions = preserve)
    } else {
      incomplete = true
      contour.copy(preserveJunctions = preserve, materialLeft = boundaryLookup.sideFor(contour))
    }
  }
  val warnings = if (incomplete) selected.warnings + OPEN_CONTOUR_WARNING else selected.warnings
  return ContourAssembly(contours, warnings)
}

// Closed contours can start at a different vertex or traverse the same edges in the opposite direction.
private fun geometryKey(contour: Contour2): Map<Segment2, Int> = contour.segments.map { segment ->
  val canonical = when (segment) {
    is LineSegment -> LineSegment(segment.start.zeroNormalized(), segment.end.zeroNormalized())
    is ArcSegment -> ArcSegment(
      segment.start.zeroNormalized(), segment.end.zeroNormalized(), segment.center.zeroNormalized(), segment.sweep,
    )
  }
  val a = canonical.start
  val b = canonical.end
  if (a.x > b.x || (a.x == b.x && a.y > b.y)) canonical.reversed() else canonical
}.groupingBy { it }.eachCount()

private fun Point2.zeroNormalized(): Point2 = Point2(x + 0.0, y + 0.0)

private data class EndpointGroup(val point: Point2, var count: Int = 0)

private fun junctionPoints(items: List<SketchItem>): List<Point2> {
  val groups = mutableMapOf<Pair<Long, Long>, EndpointGroup>()
  for (item in items) {
    if (item.circleCenter != null) continue
    val edge = item.segments.single()
    for (point in listOf(edge.start, edge.end)) {
      val cell = (point.x / JUNCTION_TOLERANCE).roundToLong() to (point.y / JUNCTION_TOLERANCE).roundToLong()
      groups.getOrPut(cell) { EndpointGroup(point) }.count++
    }
  }
  return groups.values.filter { it.count > 2 }.map(EndpointGroup::point)
}

private fun hasJunction(contour: Contour2, junctions: List<Point2>): Boolean {
  if (junctions.isEmpty()) return false
  val bounds = segmentBounds(contour.segments)
  return junctions.any { point ->
    bounds.contains(point, JUNCTION_TOLERANCE) && contour.segments.any { it.distanceTo(point) < JUNCTION_TOLERANCE }
  }
}

private data class Boundary(val segments: List<Segment2>, val bounds: Bounds2, val material: Int)

private class BoundaryLookup(loops: Collection<Contour2>) {
  // Ambiguous loops are excluded until self-intersection checks are available in the native geometry layer.
  private val boundaries by lazy {
    loops.map { loop ->
      val orientation = signedArea(loop.segments).sign.toInt()
      val material = if (loop.nesting % 2 == 0) orientation else -orientation
      Boundary(loop.segments, segmentBounds(loop.segments), material)
    }
  }
  private var remaining = BOUNDARY_CHECK_LIMIT

  fun sideFor(contour: Contour2): Int? {
    if (contour.closed || contour.ambiguous) return null
    var answer = 0
    for (segment in contour.segments.sortedByDescending(Segment2::length).take(8)) {
      if (segment.length < 0.01) continue
      val point = segment.pointAt(0.5)
      val tangent = segment.tangentAt(point)
      var side: Int? = null
      for (boundary in boundaries) {
        if (--remaining < 0) return null
        if (!boundary.bounds.contains(point, 0.001)) continue
        for (edge in boundary.segments) {
          if (--remaining < 0) return null
          if (edge.distanceTo(point) > 0.00001) continue
          val other = edge.tangentAt(point)
          val alignment = tangent.x * other.x + tangent.y * other.y
          if (abs(alignment) < 0.999999) continue
          val detected = boundary.material * alignment.sign.toInt()
          if (side != null && side != detected) return null
          side = detected
        }
      }
      if (side != null) {
        if (answer != 0 && answer != side) return null
        answer = side
      }
    }
    return answer.takeUnless { it == 0 }
  }
}

private fun Segment2.tangentAt(point: Point2): Point2 {
  if (this !is ArcSegment) return tangent()
  val dx = point.x - center.x
  val dy = point.y - center.y
  val length = hypot(dx, dy)
  val scale = if (length == 0.0) 0.0 else sweep.sign / length
  return Point2(-dy * scale, dx * scale)
}

private fun Bounds2.contains(point: Point2, margin: Double): Boolean =
  point.x >= minX - margin && point.x <= maxX + margin && point.y >= minY - margin && point.y <= maxY + margin
