package cam.atlanta.core.geometry

import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.hypot

private const val JOIN_EPSILON = 1e-8
private const val NESTING_CACHE_LIMIT = 200_000
private const val SKETCH_LAYER = "SKETCH"

enum class ContourSide { INSIDE, OUTSIDE, ON }

data class Contour2(
  val id: String,
  val segments: List<Segment2>,
  val closed: Boolean,
  val ambiguous: Boolean,
  val nesting: Int,
  val autoSide: ContourSide,
  val preserveJunctions: Boolean = false,
  val materialLeft: Int? = null,
  val layer: String = SKETCH_LAYER,
)

data class ContourAssembly(val contours: List<Contour2>, val warnings: List<String>)

data class LayeredSegment(val segment: Segment2, val layer: String)

/** Connects segments from a single drawing layer in encounter order. Tolerance is in millimetres. */
fun connectSegments(segments: List<Segment2>, tolerance: Double = 0.01): ContourAssembly =
  connectLayeredSegments(segments.map { LayeredSegment(it, SKETCH_LAYER) }, tolerance)

/** Connects within each layer while keeping contour order and nesting across the drawing. */
fun connectLayeredSegments(segments: List<LayeredSegment>, tolerance: Double = 0.01): ContourAssembly {
  require(tolerance.isFinite() && tolerance > 0) { "Допуск соединения должен быть положительным числом." }

  val unique = segments.distinctBy { segmentKey(it) }
  val duplicateCount = segments.size - unique.size
  val grid = EndpointGrid(unique, tolerance)
  val unused = unique.indices.toMutableSet()
  val contours = mutableListOf<Contour2>()
  while (unused.isNotEmpty()) {
    val first = unused.first()
    unused.remove(first)
    val (segment, layer) = unique[first]
    val chain = ArrayDeque<Segment2>()
    chain.add(segment)
    var ambiguous = false

    for (append in listOf(true, false)) {
      while (unused.isNotEmpty()) {
        val point = activeEndpoint(chain, append)
        val candidates = grid.nearby(point, layer, unused)
        if (candidates.isEmpty()) break
        if (candidates.size > 1) {
          ambiguous = true
          break
        }
        val candidate = candidates.single()
        val candidateSegment = unique[candidate.index].segment
        unused.remove(candidate.index)
        val next = if (append == candidate.atEnd) candidateSegment.reversed() else candidateSegment
        if (append) {
          if (distance(point, next.start) > JOIN_EPSILON) chain.addLast(LineSegment(point, next.start))
          chain.addLast(next)
        } else {
          if (distance(next.end, point) > JOIN_EPSILON) chain.addFirst(LineSegment(next.end, point))
          chain.addFirst(next)
        }

        val gap = distance(chain.first().start, chain.last().end)
        if (gap <= JOIN_EPSILON) break
        if (gap <= tolerance) {
          val endpoint = activeEndpoint(chain, append)
          if (grid.nearby(endpoint, layer, unused).none { distance(endpoint, it.point) <= JOIN_EPSILON }) break
        }
      }
    }

    val start = chain.first().start
    val end = chain.last().end
    val gap = distance(start, end)
    val closed = gap <= tolerance
    if (closed && gap > JOIN_EPSILON) chain.addLast(LineSegment(end, start))
    contours.add(
      Contour2(
        id = "c${contours.size + 1}",
        segments = chain.toList(),
        closed = closed,
        ambiguous = ambiguous,
        nesting = 0,
        autoSide = if (closed) ContourSide.OUTSIDE else ContourSide.ON,
        layer = layer,
      ),
    )
  }

  val warnings = buildList {
    if (duplicateCount != 0) add("Удалены совпадающие элементы: $duplicateCount.")
    if (contours.any { it.ambiguous }) {
      add("Есть разветвления/касания. Неоднозначные контуры нельзя экспортировать; разделите элементы по слоям.")
    }
  }
  return ContourAssembly(assignNesting(contours), warnings)
}

private fun activeEndpoint(chain: ArrayDeque<Segment2>, append: Boolean): Point2 =
  if (append) chain.last().end else chain.first().start

private data class SegmentKey(val layer: String, val first: Point2, val second: Point2, val arc: ArcKey?)

private data class ArcKey(val center: Point2, val midpoint: Point2, val sweepMagnitude: Double)

private fun segmentKey(layered: LayeredSegment): SegmentKey {
  val (segment, layer) = layered
  val start = segment.start.quantized()
  val end = segment.end.quantized()
  val xComparison = start.x.compareTo(end.x)
  val startFirst = xComparison < 0 || xComparison == 0 && start.y.compareTo(end.y) <= 0
  val arc = if (segment is ArcSegment) {
    ArcKey(segment.center.quantized(), segment.pointAt(0.5).quantized(), quantize(abs(segment.sweep)))
  } else {
    null
  }
  return if (startFirst) SegmentKey(layer, start, end, arc) else SegmentKey(layer, end, start, arc)
}

private fun Point2.quantized(): Point2 = Point2(quantize(x), quantize(y))

private fun quantize(value: Double): Double {
  val scaled = value * 1e6
  val low = floor(scaled)
  val rounded = if (scaled - low >= 0.5) low + 1 else low
  return canonicalZero(rounded)
}

private data class Endpoint(val index: Int, val atEnd: Boolean, val point: Point2)

private data class GridCell(val x: Double, val y: Double, val layer: String)

private class EndpointGrid(segments: List<LayeredSegment>, private val tolerance: Double) {
  private val cells = HashMap<GridCell, MutableList<Endpoint>>()

  init {
    for ((index, layered) in segments.withIndex()) {
      val (segment, layer) = layered
      cells.getOrPut(cell(segment.start, layer), ::mutableListOf).add(Endpoint(index, false, segment.start))
      cells.getOrPut(cell(segment.end, layer), ::mutableListOf).add(Endpoint(index, true, segment.end))
    }
  }

  fun nearby(point: Point2, layer: String, unused: Set<Int>): List<Endpoint> {
    val center = cell(point, layer)
    val exact = mutableListOf<Endpoint>()
    val near = mutableListOf<Endpoint>()
    for (dx in -1..1) {
      for (dy in -1..1) {
        val candidates = cells[GridCell(center.x + dx, center.y + dy, layer)].orEmpty()
        for (candidate in candidates) {
          if (candidate.index !in unused) continue
          val gap = distance(point, candidate.point)
          if (gap <= JOIN_EPSILON) exact.add(candidate)
          else if (gap <= tolerance) near.add(candidate)
        }
      }
    }
    return exact.ifEmpty { near }
  }

  private fun cell(point: Point2, layer: String): GridCell = GridCell(
    canonicalZero(floor(point.x / tolerance)),
    canonicalZero(floor(point.y / tolerance)),
    layer,
  )
}

private fun canonicalZero(value: Double): Double = if (value == 0.0) 0.0 else value

private fun distance(a: Point2, b: Point2): Double = hypot(a.x - b.x, a.y - b.y)

private class NestingEntry(val contour: Contour2, val bounds: Bounds2) {
  var polygon: List<Point2>? = null
}

private sealed interface NestingNode {
  val bounds: Bounds2

  data class Leaf(override val bounds: Bounds2, val entries: List<NestingEntry>) : NestingNode

  data class Branch(override val bounds: Bounds2, val left: NestingNode, val right: NestingNode) : NestingNode
}

private fun nestingTree(entries: List<NestingEntry>): NestingNode {
  val bounds = Bounds2(
    minX = entries.minOf { it.bounds.minX },
    minY = entries.minOf { it.bounds.minY },
    maxX = entries.maxOf { it.bounds.maxX },
    maxY = entries.maxOf { it.bounds.maxY },
  )
  if (entries.size <= 8) return NestingNode.Leaf(bounds, entries)

  val sortByX = bounds.maxX - bounds.minX >= bounds.maxY - bounds.minY
  val sorted = entries.sortedBy { if (sortByX) it.bounds.minX else it.bounds.minY }
  val middle = entries.size / 2
  return NestingNode.Branch(
    bounds,
    nestingTree(sorted.subList(0, middle)),
    nestingTree(sorted.subList(middle, sorted.size)),
  )
}

private fun assignNesting(contours: List<Contour2>): List<Contour2> {
  val closed = contours.filter { it.closed }.map { NestingEntry(it, segmentBounds(it.segments)) }
  if (closed.isEmpty()) return contours
  val tree = nestingTree(closed)
  var cachedPoints = 0

  fun countContainers(node: NestingNode, point: Point2, contour: Contour2): Int {
    if (!node.bounds.contains(point)) return 0
    return when (node) {
      is NestingNode.Branch -> countContainers(node.left, point, contour) + countContainers(node.right, point, contour)
      is NestingNode.Leaf -> {
        var count = 0
        for (entry in node.entries) {
          if (entry.contour === contour || !entry.bounds.contains(point)) continue
          val polygon = entry.polygon ?: flattenSegments(entry.contour.segments)
          if (entry.polygon == null && polygon.size <= NESTING_CACHE_LIMIT - cachedPoints) {
            entry.polygon = polygon
            cachedPoints += polygon.size
          }
          if (containsPoint(polygon, point)) count++
        }
        count
      }
    }
  }

  return contours.map { contour ->
    if (!contour.closed) contour
    else {
      val nesting = countContainers(tree, contour.segments.first().pointAt(0.37), contour)
      val side = if (nesting % 2 == 0) ContourSide.OUTSIDE else ContourSide.INSIDE
      contour.copy(nesting = nesting, autoSide = side)
    }
  }
}

private fun Bounds2.contains(point: Point2): Boolean =
  point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY

private fun containsPoint(polygon: List<Point2>, point: Point2): Boolean {
  var previous = polygon.lastOrNull() ?: return false
  var inside = false
  for (next in polygon) {
    if ((next.y > point.y) != (previous.y > point.y) &&
      point.x < (previous.x - next.x) * (point.y - next.y) / (previous.y - next.y) + next.x
    ) inside = !inside
    previous = next
  }
  return inside
}
