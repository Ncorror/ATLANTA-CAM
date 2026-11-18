package cam.atlanta.core.dxf

import cam.atlanta.core.geometry.ArcSegment
import cam.atlanta.core.geometry.ContourAssembly
import cam.atlanta.core.geometry.LayeredSegment
import cam.atlanta.core.geometry.LineSegment
import cam.atlanta.core.geometry.Point2
import cam.atlanta.core.geometry.Segment2
import cam.atlanta.core.geometry.connectLayeredSegments
import cam.atlanta.core.geometry.segmentFromBulge
import java.math.BigDecimal
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sin

data class DxfOptions(val scale: Double? = null, val tolerance: Double = 0.03, val joinTolerance: Double = 0.01)

data class DxfDrawing(val plan: ContourAssembly, val units: Int, val factor: Double, val unsupported: List<String>)

/** Reads model-space 2D geometry from an ASCII DXF and converts its coordinates to millimetres. */
fun readDxf(text: String, options: DxfOptions = DxfOptions()): DxfDrawing {
  val source = text.removePrefix("\uFEFF")
  require(!source.startsWith("AutoCAD Binary DXF")) { "Бинарный DXF не поддерживается. Сохраните ASCII DXF." }
  val document = DxfDocument.read(source)
  val units = document.units
  val factor = options.scale ?: unitFactors[units] ?: 1.0
  require(factor.isFinite() && factor > 0) { "Неверный масштаб DXF." }
  require(units == 0 || units in unitFactors || options.scale != null) {
    "Единицы DXF $units не поддерживаются. Укажите масштаб вручную."
  }
  val tolerance = if (options.tolerance == 0.0) 0.03 else options.tolerance
  val joinTolerance = if (options.joinTolerance == 0.0) 0.01 else options.joinTolerance
  require(tolerance.isFinite() && tolerance > 0 && joinTolerance.isFinite() && joinTolerance > 0) {
    "Допуски DXF должны быть положительными числами."
  }

  val expansion = DxfExpansion(document.blocks, tolerance, factor)
  if (units == 0) {
    expansion.warnings.add("В DXF не заданы единицы. Принято: 1 единица = ${factor.display()} мм. Проверьте размер на экране.")
  }
  expansion.expand(document.entities, Transform(factor, 0.0, 0.0, factor, 0.0, 0.0))
  if (expansion.unsupported.isNotEmpty()) {
    val counted = expansion.unsupported.entries.joinToString(", ") { (type, count) -> "$type ×$count" }
    expansion.warnings.add("Не включены в траекторию: $counted.")
  }
  require(expansion.segments.isNotEmpty()) {
    "В ENTITIES нет поддерживаемой геометрии. Нужны линии, дуги, окружности, полилинии, эллипсы или сплайны."
  }
  val connected = connectLayeredSegments(expansion.segments, joinTolerance)
  val plan = connected.copy(warnings = (expansion.warnings + connected.warnings).toList())
  return DxfDrawing(plan, units, factor, expansion.unsupported.keys.toList())
}

private const val EPS = 1e-8
private const val TAU = 2 * PI
private const val MAX_BLOCK_DEPTH = 12
private const val MAX_BLOCK_COPIES = 2_000
private const val MAX_SEGMENTS = 30_000
private const val MAX_GROUPS = 1_000_000
private const val MAX_EXPANSION_WORK = 2_000_000
private const val INVALID_COORDINATES = "В DXF есть неверные координаты."
private const val NESTED_BLOCKS = "Циклические или слишком вложенные блоки DXF."

private val unitFactors = mapOf(
  1 to 25.4, 2 to 304.8, 4 to 1.0, 5 to 10.0, 6 to 1000.0,
  8 to 0.0000254, 9 to 0.0254, 10 to 914.4, 13 to 0.001, 14 to 100.0, 21 to 304.800609601,
)

private val supported = setOf("LINE", "ARC", "CIRCLE", "LWPOLYLINE", "POLYLINE", "SPLINE", "ELLIPSE")

private class DxfEntity(val type: String, val groups: List<Pair<Int, String>>) {
  val vertices = mutableListOf<DxfEntity>()

  fun value(code: Int, default: String = ""): String = groups.firstOrNull { it.first == code }?.second ?: default

  fun number(code: Int, default: Double = 0.0): Double =
    groups.firstOrNull { it.first == code }?.second?.finiteNumber() ?: default

  fun point(x: Int, y: Int): Point2 = Point2(number(x), number(y))

  fun integer(code: Int, default: Int = 0): Int = number(code, default.toDouble()).wholeInt()
}

private class DxfBlock(val header: DxfEntity) {
  val entities = mutableListOf<DxfEntity>()
}

private data class DxfDocument(val units: Int, val entities: List<DxfEntity>, val blocks: Map<String, DxfBlock>) {
  companion object {
    fun read(text: String): DxfDocument {
      val source = text.trimEnd { it.isWhitespace() || it == '\uFEFF' }
      val entities = mutableListOf<DxfEntity>()
      val blocks = mutableMapOf<String, DxfBlock>()
      var section = ""
      var currentBlock: DxfBlock? = null
      var polyline: DxfEntity? = null
      var units = 0
      var readUnits = false
      var type: String? = null
      var groups = mutableListOf<Pair<Int, String>>()

      fun finishRecord() {
        val name = type ?: return
        if (name == "SECTION" || name == "ENDSEC") {
          section = if (name == "SECTION") groups.firstOrNull()?.second.orEmpty() else ""
          currentBlock = null
          polyline = null
          return
        }
        if (section != "ENTITIES" && section != "BLOCKS") return
        when (name) {
          "BLOCK" -> {
            val header = DxfEntity(name, groups)
            val block = DxfBlock(header)
            blocks[header.value(2)] = block
            currentBlock = block
            polyline = null
          }
          "ENDBLK" -> {
            currentBlock = null
            polyline = null
          }
          "SEQEND" -> polyline = null
          else -> {
            val entity = DxfEntity(name, groups)
            val currentPolyline = polyline
            if (name == "VERTEX" && currentPolyline != null) {
              currentPolyline.vertices.add(entity)
            } else {
              val destination = if (section == "BLOCKS") currentBlock?.entities else entities
              destination?.add(entity)
              polyline = entity.takeIf { name == "POLYLINE" && destination != null }
            }
          }
        }
      }

      if (source.isNotEmpty()) {
        val lines = source.lineSequence().iterator()
        var pairIndex = 0
        while (lines.hasNext()) {
          require(pairIndex < MAX_GROUPS) { "Слишком много групп DXF." }
          val code = lines.next().trim().toDoubleOrNull()
          val lineNumber = 2 * pairIndex + 1
          require(code != null && code.toInt().toDouble() == code) { "Неверный код группы DXF в строке $lineNumber" }
          require(lines.hasNext()) { "Нарушены пары код/значение DXF." }
          val group = code.toInt()
          val value = lines.next().trim()
          if (readUnits) units = value.finiteNumber().wholeInt()
          readUnits = group == 9 && value == "\$INSUNITS"
          if (group == 0) {
            finishRecord()
            type = value
            groups = mutableListOf()
          } else if (if (type == "SECTION") groups.isEmpty() else section == "ENTITIES" || section == "BLOCKS") {
            groups.add(group to value)
          }
          pairIndex++
        }
      }
      finishRecord()
      return DxfDocument(units, entities, blocks)
    }
  }
}

private data class Transform(
  val a: Double, val b: Double, val c: Double, val d: Double, val x: Double, val y: Double,
  val reflected: Boolean = false,
) {
  fun apply(point: Point2): Point2 = Point2(a * point.x + c * point.y + x, b * point.x + d * point.y + y)

  fun compose(inner: Transform): Transform = Transform(
    a * inner.a + c * inner.b,
    b * inner.a + d * inner.b,
    a * inner.c + c * inner.d,
    b * inner.c + d * inner.d,
    a * inner.x + c * inner.y + x,
    b * inner.x + d * inner.y + y,
    reflected != inner.reflected,
  )
}

private class DxfExpansion(
  private val blocks: Map<String, DxfBlock>,
  private val tolerance: Double,
  private val factor: Double,
) {
  val segments = mutableListOf<LayeredSegment>()
  val warnings = linkedSetOf<String>()
  val unsupported = linkedMapOf<String, Int>()
  private val activeBlocks = mutableSetOf<String>()
  private var remaining = MAX_EXPANSION_WORK

  fun expand(entities: List<DxfEntity>, transform: Transform, inherited: String = "0", depth: Int = 0) {
    for (entity in entities) {
      consumeWork()
      if (entity.number(67) == 1.0) continue
      val layer = entity.value(8, "0").let { if (it == "0") inherited else it }
      require(entity.number(210) == 0.0 && entity.number(220) == 0.0 && abs(entity.number(230, 1.0) - 1) <= EPS) {
        "Элемент ${entity.type} имеет наклонную/обратную OCS. Разверните чертёж в XY и экспортируйте DXF."
      }
      if (entity.type == "INSERT") {
        insert(entity, transform, layer, depth)
        continue
      }
      if (entity.type !in supported) {
        unsupported[entity.type] = (unsupported[entity.type] ?: 0) + 1
        continue
      }
      require(abs(entity.number(30)) <= EPS && abs(entity.number(31)) <= EPS &&
        abs(entity.number(38)) <= EPS && abs(entity.number(39)) <= EPS) {
        "Элемент ${entity.type} имеет высоту/толщину вне XY. Для 2D обработки экспортируйте плоский DXF."
      }
      val drawing = when (entity.type) {
        "LINE" -> sequenceOf(LineSegment(entity.point(10, 20), entity.point(11, 21)))
        "ARC", "CIRCLE" -> arcs(entity)
        "LWPOLYLINE", "POLYLINE" -> polyline(entity)
        "SPLINE" -> spline(entity)
        "ELLIPSE" -> ellipse(entity)
        else -> error("Неизвестный тип DXF: ${entity.type}")
      }
      for (segment in drawing) emit(segment, transform, layer)
    }
  }

  private fun insert(entity: DxfEntity, transform: Transform, layer: String, depth: Int) {
    val name = entity.value(2)
    val block = blocks[name] ?: throw IllegalArgumentException("Не найден блок ${entity.value(2, "0")}")
    val sx = entity.number(41, 1.0)
    val sy = entity.number(42, 1.0)
    require(sx != 0.0 && sy != 0.0 && abs(abs(sx) - abs(sy)) <= EPS) {
      "Блок с неравномерным масштабом. Выполните EXPLODE в CAD."
    }
    require(abs(entity.number(30)) <= EPS && abs(block.header.number(30)) <= EPS) { "Блок вне плоскости XY." }
    val columns = entity.integer(70, 1)
    val rows = entity.integer(71, 1)
    require(columns > 0 && rows > 0) { "Некорректное количество элементов массива блоков DXF." }
    require(columns.toLong() * rows <= MAX_BLOCK_COPIES) { "Слишком большой массив блоков." }
    require(depth < MAX_BLOCK_DEPTH && activeBlocks.add(name)) { NESTED_BLOCKS }

    val angle = radians(entity.number(50))
    val cosine = cos(angle)
    val sine = sin(angle)
    val origin = entity.point(10, 20)
    val base = block.header.point(10, 20)
    val columnSpacing = entity.number(44)
    val rowSpacing = entity.number(45)
    try {
      if (block.entities.isEmpty()) return
      for (row in 0 until rows) {
        for (column in 0 until columns) {
          consumeWork()
          val offsetX = column * columnSpacing - base.x * sx
          val offsetY = row * rowSpacing - base.y * sy
          val local = Transform(
            cosine * sx, sine * sx, -sine * sy, cosine * sy,
            origin.x + (cosine * offsetX - sine * offsetY),
            origin.y + (sine * offsetX + cosine * offsetY),
            (sx < 0) != (sy < 0),
          )
          expand(block.entities, transform.compose(local), layer, depth + 1)
        }
      }
    } finally {
      activeBlocks.remove(name)
    }
  }

  private fun arcs(entity: DxfEntity): Sequence<ArcSegment> {
    val center = entity.point(10, 20)
    val radius = entity.number(40)
    require(radius > 0) { "Нулевой радиус дуги DXF." }
    if (entity.type == "CIRCLE") {
      val right = Point2(center.x + radius, center.y)
      val left = Point2(center.x - radius, center.y)
      return sequenceOf(ArcSegment(right, left, center, PI), ArcSegment(left, right, center, PI))
    }
    val start = radians(entity.number(50))
    val end = radians(entity.number(51))
    val difference = end - start
    require(abs(difference) <= TAU + EPS) { "Угол дуги DXF выходит за пределы одного оборота." }
    var sweep = minOf(difference, TAU)
    if (sweep <= EPS) {
      sweep %= TAU
      while (sweep <= EPS) sweep += TAU
    }
    return sequenceOf(ArcSegment(
      Point2(center.x + radius * cos(start), center.y + radius * sin(start)),
      Point2(center.x + radius * cos(end), center.y + radius * sin(end)),
      center, sweep,
    ))
  }

  private fun polyline(entity: DxfEntity): Sequence<Segment2> {
    val flags = entity.integer(70)
    require(flags and (8 or 16 or 64) == 0 && entity.vertices.none { abs(it.number(30)) > EPS }) {
      "3D POLYLINE/сетка не поддерживается."
    }
    val vertices = if (entity.type == "LWPOLYLINE") lightweightVertices(entity.groups) else {
      entity.vertices.map { Vertex(it.number(10), it.number(20), it.number(42)) }
    }
    val closed = flags and 1 != 0
    val count = if (closed) vertices.size else vertices.size - 1
    return sequence {
      for (i in 0 until count) {
        val vertex = vertices[i]
        val next = vertices[(i + 1) % vertices.size]
        yield(segmentFromBulge(Point2(vertex.x, vertex.y), Point2(next.x, next.y), vertex.bulge))
      }
    }
  }

  private fun spline(entity: DxfEntity): Sequence<Segment2> {
    val result = sampleDxfSpline(entity.groups, entity.integer(71), entity.integer(70) and 1 != 0, tolerance / factor)
    warnings.add("SPLINE аппроксимирован отрезками с допуском ${tolerance.display()} мм.")
    return result.asSequence()
  }

  private fun ellipse(entity: DxfEntity): Sequence<Segment2> {
    val result = sampleDxfEllipse(
      entity.point(10, 20), entity.point(11, 21), entity.number(40),
      entity.number(41), entity.number(42, TAU), tolerance / factor,
    )
    warnings.add("ELLIPSE аппроксимирован отрезками.")
    return result.asSequence()
  }

  private fun emit(segment: Segment2, transform: Transform, layer: String) {
    consumeWork()
    val start = transform.apply(segment.start)
    val end = transform.apply(segment.end)
    require(start.isFinite() && end.isFinite()) { INVALID_COORDINATES }
    val value = when (segment) {
      is LineSegment -> LineSegment(start, end)
      is ArcSegment -> {
        val center = transform.apply(segment.center)
        require(center.isFinite() && segment.sweep.isFinite()) { INVALID_COORDINATES }
        ArcSegment(start, end, center, if (transform.reflected) -segment.sweep else segment.sweep)
      }
    }
    require(value.length.isFinite()) { INVALID_COORDINATES }
    if (value.length <= EPS) return
    require(segments.size < MAX_SEGMENTS) { "Слишком много элементов DXF (лимит $MAX_SEGMENTS)." }
    segments.add(LayeredSegment(value, layer))
  }

  private fun consumeWork() {
    require(remaining-- > 0) { "Слишком сложная структура блоков DXF." }
  }
}

private data class Vertex(val x: Double, var y: Double = 0.0, var bulge: Double = 0.0)

private fun lightweightVertices(groups: List<Pair<Int, String>>): List<Vertex> = buildList {
  var current: Vertex? = null
  for ((code, value) in groups) {
    when (code) {
      10 -> {
        val vertex = Vertex(value.finiteNumber())
        add(vertex)
        current = vertex
      }
      20 -> current?.y = value.finiteNumber()
      42 -> current?.bulge = value.finiteNumber()
    }
  }
}

private fun String.finiteNumber(): Double {
  val value = if (isEmpty()) 0.0 else toDoubleOrNull()
  require(value != null && value.isFinite()) { INVALID_COORDINATES }
  return value
}

private fun Double.wholeInt(): Int {
  val integer = toInt()
  require(integer.toDouble() == this) { "В DXF есть неверное целое значение." }
  return integer
}

private fun radians(degrees: Double): Double {
  val radians = degrees * PI / 180
  require(radians.isFinite()) { INVALID_COORDINATES }
  return radians
}

private fun Double.display(): String {
  val decimal = BigDecimal.valueOf(this).stripTrailingZeros()
  return if (this == 0.0 || abs(this) in 1e-6..<1e21) decimal.toPlainString() else decimal.toString().lowercase()
}

private fun Point2.isFinite(): Boolean = x.isFinite() && y.isFinite()
