package cam.atlanta.core.dxf

import cam.atlanta.core.geometry.ArcSegment
import cam.atlanta.core.geometry.ContourSide
import cam.atlanta.core.geometry.LineSegment
import cam.atlanta.core.geometry.Point2
import cam.atlanta.core.geometry.segmentBounds
import kotlin.math.PI
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertTrue

class DxfReaderTest {
  @Test
  fun `converts inches and honors a manual scale with or without declared units`() {
    val geometry = line(0, 0, 2, 1)
    val inches = readDxf(drawing(geometry, units = 1))
    assertEquals(1, inches.units)
    assertEquals(25.4, inches.factor)
    assertEquals(Point2(50.8, 25.4), inches.plan.contours.single().segments.single().end)

    val unknownUnits = drawing(geometry, units = 99)
    assertFailsWith<IllegalArgumentException> { readDxf(unknownUnits) }
    val override = readDxf(unknownUnits, DxfOptions(scale = 2.5))
    assertEquals(99, override.units)
    assertEquals(2.5, override.factor)
    assertEquals(Point2(5.0, 2.5), override.plan.contours.single().segments.single().end)

    val missingUnits = drawing(geometry, units = null)
    val unitless = readDxf("\uFEFF" + missingUnits.replace("\n", "\r\n"))
    assertEquals(0, unitless.units)
    assertEquals(1.0, unitless.factor)
    assertEquals(Point2(2.0, 1.0), unitless.plan.contours.single().segments.single().end)
    assertTrue(unitless.plan.warnings.any { it.contains("не заданы единицы") })
    assertEquals(2.5, readDxf(missingUnits, DxfOptions(scale = 2.5)).factor)
    assertFailsWith<IllegalArgumentException> { readDxf(missingUnits, DxfOptions(scale = 0.0)) }
    assertEquals(unitless, readDxf(missingUnits.replace('\n', '\r')))
  }

  @Test
  fun `deduplicates and connects only within one drawing layer`() {
    val text = drawing(
      line(0, 0, 10, 0, "CUT") + line(10, 0, 0, 0, "CUT") +
        line(0, 0, 10, 0, "COPY") + line(10, 0, 20, 0, "WALL"),
    )
    val plan = readDxf(text).plan

    assertEquals(listOf("c1", "c2", "c3"), plan.contours.map { it.id })
    assertEquals(listOf("CUT", "COPY", "WALL"), plan.contours.map { it.layer })
    assertEquals(plan.contours[0].segments, plan.contours[1].segments)
    assertTrue(plan.contours.all { it.segments.size == 1 && !it.ambiguous })
    assertEquals(listOf("Удалены совпадающие элементы: 1."), plan.warnings)
  }

  @Test
  fun `counts containing closed contours across layers`() {
    val plan = readDxf(drawing(
      circle(0, 0, 12, "OUTER") + circle(0, 0, 3, "HOLE"),
    )).plan

    assertEquals(listOf("OUTER", "HOLE"), plan.contours.map { it.layer })
    assertEquals(listOf(0, 1), plan.contours.map { it.nesting })
    assertEquals(listOf(ContourSide.OUTSIDE, ContourSide.INSIDE), plan.contours.map { it.autoSide })
    assertTrue(plan.contours.all { it.closed })
  }

  @Test
  fun `reads line circular arc circle and bulged lightweight polyline`() {
    val plan = readDxf(drawing(
      line(0, 0, 2, 0, "LINE") +
        record("ARC", 8 to "ARC", 10 to 10, 20 to 3, 40 to 2, 50 to 270, 51 to 45) +
        circle(25, -4, 2.5, "CIRCLE") +
        record("LWPOLYLINE", 8 to "BULGE", 90 to 2, 70 to 1, 10 to 0, 20 to 0, 42 to -1, 10 to 6, 20 to 0),
    )).plan
    val contours = plan.contours.associateBy { it.layer }

    assertEquals(
      LineSegment(Point2(0.0, 0.0), Point2(2.0, 0.0)),
      contours.getValue("LINE").segments.single(),
    )
    val arc = assertIs<ArcSegment>(contours.getValue("ARC").segments.single())
    assertPoint(10.0, 1.0, arc.start)
    assertPoint(10.0, 3.0, arc.center)
    assertEquals(3 * PI / 4, arc.sweep, 1e-10)

    val circle = contours.getValue("CIRCLE")
    assertTrue(circle.closed)
    assertEquals(2, circle.segments.size)
    for (segment in circle.segments) {
      val half = assertIs<ArcSegment>(segment)
      assertPoint(25.0, -4.0, half.center)
      assertEquals(2.5, half.radius)
      assertEquals(PI, half.sweep)
    }

    val bulged = contours.getValue("BULGE")
    assertTrue(bulged.closed)
    val semicircle = assertIs<ArcSegment>(bulged.segments.first())
    assertPoint(3.0, 0.0, semicircle.center)
    assertEquals(-PI, semicircle.sweep)
    assertEquals(LineSegment(Point2(6.0, 0.0), Point2(0.0, 0.0)), bulged.segments.last())
  }

  @Test
  fun `reads old polyline vertex records through SEQEND`() {
    val polyline = record("POLYLINE", 8 to "LEGACY", 66 to 1, 70 to 1) +
      record("VERTEX", 10 to 40, 20 to 0, 30 to 0) +
      record("VERTEX", 10 to 43, 20 to 0, 30 to 0, 42 to 1) +
      record("VERTEX", 10 to 40, 20 to 4, 30 to 0) +
      record("SEQEND")
    val result = readDxf(drawing(polyline + line(50, 1, 52, 1)))
    val contour = result.plan.contours.first()

    assertEquals("LEGACY", contour.layer)
    assertTrue(contour.closed)
    assertEquals(3, contour.segments.size)
    assertPoint(40.0, 0.0, contour.segments.first().start)
    assertEquals(PI, assertIs<ArcSegment>(contour.segments[1]).sweep)
    assertPoint(40.0, 0.0, contour.segments.last().end)
    assertEquals(2, result.plan.contours.size)
    assertTrue(result.unsupported.isEmpty())
  }

  @Test
  fun `expands mirrored rotated insert arrays with inherited and explicit layers`() {
    val blocks = record("BLOCK", 2 to "PART", 10 to 1, 20 to 2) +
      record("ARC", 8 to "0", 10 to 1, 20 to 2, 40 to 2, 50 to 0, 51 to 90) +
      line(2, 2, 3, 2, "FIXED") +
      record("ENDBLK")
    val insert = record(
      "INSERT", 8 to "ASSEMBLY", 2 to "PART", 10 to 10, 20 to 20,
      41 to -2, 42 to 2, 50 to 90, 70 to 2, 71 to 2, 44 to 6, 45 to 8,
    )
    val contours = readDxf(drawing(insert, blocks = blocks)).plan.contours

    val arcContours = contours.filter { it.layer == "ASSEMBLY" }
    val lineContours = contours.filter { it.layer == "FIXED" }
    assertEquals(4, arcContours.size)
    assertEquals(4, lineContours.size)
    val expectedCenters = listOf(Point2(10.0, 20.0), Point2(10.0, 26.0), Point2(2.0, 20.0), Point2(2.0, 26.0))
    for ((contour, center) in arcContours.zip(expectedCenters)) {
      val arc = assertIs<ArcSegment>(contour.segments.single())
      assertPoint(center.x, center.y, arc.center)
      assertPoint(center.x, center.y - 4, arc.start)
      assertPoint(center.x - 4, center.y, arc.end)
      assertEquals(-PI / 2, arc.sweep, 1e-10)
    }
    val line = assertIs<LineSegment>(lineContours.first().segments.single())
    assertPoint(10.0, 18.0, line.start)
    assertPoint(10.0, 16.0, line.end)
  }

  @Test
  fun `approximates weighted splines and ellipses to the requested tolerance`() {
    val spline = record(
      "SPLINE", 8 to "CURVE", 70 to 4, 71 to 2, 72 to 6, 73 to 3,
      40 to 0, 40 to 0, 40 to 0, 40 to 1, 40 to 1, 40 to 1,
      41 to 1, 41 to 2, 41 to 1,
      10 to 0, 20 to 0, 30 to 0, 10 to 2, 20 to 4, 30 to 0, 10 to 4, 20 to 0, 30 to 0,
    )
    val ellipse = record(
      "ELLIPSE", 8 to "OVAL", 10 to 25, 20 to -4, 11 to 7, 21 to 0,
      40 to 0.5, 41 to 0, 42 to 2 * PI,
    )
    val text = drawing(spline + ellipse)
    val fine = readDxf(text, DxfOptions(tolerance = 0.005)).plan
    val coarse = readDxf(text, DxfOptions(tolerance = 0.15)).plan.contours.associateBy { it.layer }

    for (contour in fine.contours) {
      assertTrue(contour.segments.all { it is LineSegment })
      assertTrue(contour.segments.size > coarse.getValue(contour.layer).segments.size)
    }
    val curve = fine.contours.first()
    assertFalse(curve.closed)
    assertPoint(0.0, 0.0, curve.segments.first().start)
    assertPoint(4.0, 0.0, curve.segments.last().end)
    assertEquals(8.0 / 3, curve.segments.maxOf { it.end.y }, 1e-10)
    val oval = fine.contours.last()
    assertTrue(oval.closed)
    val bounds = segmentBounds(oval.segments)
    assertEquals(18.0, bounds.minX, 0.005)
    assertEquals(32.0, bounds.maxX, 0.005)
    assertEquals(-7.5, bounds.minY, 0.005)
    assertEquals(-0.5, bounds.maxY, 0.005)
    assertTrue(fine.warnings.any { "SPLINE" in it })
    assertTrue(fine.warnings.any { "ELLIPSE" in it })
  }

  @Test
  fun `reports unsupported entities and skips paper space entities`() {
    val text = drawing(
      line(0, 0, 10, 0) +
        record("TEXT", 1 to "ANNOTATION", 10 to 2, 20 to 3) +
        record("TEXT", 1 to "SECOND", 10 to 2, 20 to 6) +
        record("VIEWPORT") +
        record("LINE", 67 to 1, 10 to 50, 20 to 50, 11 to 60, 21 to 60),
    )
    val result = readDxf(text)

    assertEquals(listOf("TEXT", "VIEWPORT"), result.unsupported)
    assertEquals(1, result.plan.contours.size)
    assertTrue(result.plan.warnings.any { "TEXT ×2" in it && "VIEWPORT ×1" in it })
  }

  @Test
  fun `rejects nonplanar binary malformed and empty drawings`() {
    val outOfPlane = record("LINE", 10 to 0, 20 to 0, 30 to 2, 11 to 10, 21 to 0)
    val reversedOcs = record("LINE", 10 to 0, 20 to 0, 11 to 10, 21 to 0, 230 to -1)
    val old3D = record("POLYLINE", 70 to 8) +
      record("VERTEX", 10 to 0, 20 to 0) + record("VERTEX", 10 to 2, 20 to 2) + record("SEQEND")
    val cases = listOf(
      drawing(outOfPlane), drawing(reversedOcs), drawing(old3D), drawing(""),
      "0\nSECTION\n2\n", "AutoCAD Binary DXF\r\n\u001a\u0000",
    )
    for (text in cases) {
      assertFailsWith<IllegalArgumentException> { readDxf(text) }
    }
  }

  @Test
  fun `accepts a single full turn but rejects a multi-turn ARC`() {
    val full = record("ARC", 10 to 0, 20 to 0, 40 to 10, 50 to -30, 51 to 330)
    val segment = assertIs<ArcSegment>(readDxf(drawing(full)).plan.contours.single().segments.single())
    assertEquals(2 * PI, segment.sweep, 1e-10)

    val malformed = record("ARC", 10 to 0, 20 to 0, 40 to 10, 50 to 0, 51 to 1e12)
    assertFailsWith<IllegalArgumentException> { readDxf(drawing(malformed)) }
  }

  private fun assertPoint(x: Double, y: Double, point: Point2) {
    assertEquals(x, point.x, 1e-9)
    assertEquals(y, point.y, 1e-9)
  }

  private fun line(x1: Number, y1: Number, x2: Number, y2: Number, layer: String = "0"): String =
    record("LINE", 8 to layer, 10 to x1, 20 to y1, 11 to x2, 21 to y2)

  private fun circle(x: Number, y: Number, radius: Number, layer: String): String =
    record("CIRCLE", 8 to layer, 10 to x, 20 to y, 40 to radius)

  private fun record(type: String, vararg fields: Pair<Int, Any>): String =
    pairs(0 to type, *fields)

  private fun section(name: String, contents: String): String =
    record("SECTION", 2 to name) + contents + record("ENDSEC")

  private fun drawing(entities: String, units: Int? = 4, blocks: String? = null): String = buildString {
    if (units != null) append(section("HEADER", pairs(9 to "${'$'}INSUNITS", 70 to units)))
    if (blocks != null) append(section("BLOCKS", blocks))
    append(section("ENTITIES", entities))
    append(record("EOF"))
  }

  private fun pairs(vararg fields: Pair<Int, Any>): String =
    fields.joinToString(separator = "") { (code, value) -> "$code\n$value\n" }
}
