package cam.atlanta.core.geometry

import kotlin.math.PI
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertNull

class SegmentsTest {
  @Test
  fun `line interpolation tangent distance and reversal match the planar engine`() {
    val start = Point2(1.0, 2.0)
    val end = Point2(4.0, 6.0)
    val line = LineSegment(start, end)

    assertEquals(5.0, line.length)
    assertPoint(Point2(2.5, 4.0), line.pointAt(0.5))
    assertPoint(Point2(0.6, 0.8), line.tangent())
    assertEquals(5.0, line.distanceTo(Point2(7.0, 10.0)))
    assertEquals(5.0, line.distanceTo(Point2(5.0, -1.0)))
    assertEquals(LineSegment(end, start), line.reversed())
    assertEquals(listOf(start, end), line.sample())

    val zeroLength = LineSegment(start, start)
    assertPoint(Point2(0.0, 0.0), zeroLength.tangent())
    assertEquals(5.0, zeroLength.distanceTo(end))
  }

  @Test
  fun `quarter arc includes the cardinal maximum between its endpoints`() {
    val arc = ArcSegment(Point2(3.0, 4.0), Point2(-4.0, 3.0), Point2(0.0, 0.0), PI / 2)

    assertEquals(7.853981633974483, arc.length, EPS)
    assertPoint(Point2(-0.707106781186548, 4.949747468305833), arc.pointAt(0.5))
    assertPoint(Point2(-0.8, 0.6), arc.tangent())
    assertPoint(Point2(-0.6, -0.8), arc.tangent(atEnd = true))
    assertBounds(-4.0, 3.0, 3.0, 5.0, segmentBounds(listOf(arc)))
    assertEquals(7.211102550927979, arc.distanceTo(Point2(9.0, 0.0)), EPS)
    assertEquals(9, arc.sample().size)
  }

  @Test
  fun `clockwise major arc keeps its sign and includes the opposite extrema`() {
    val arc = ArcSegment(Point2(3.0, 4.0), Point2(-4.0, 3.0), Point2(0.0, 0.0), -3 * PI / 2)
    val reversed = assertIs<ArcSegment>(arc.reversed())

    assertEquals(-arc.sweep, reversed.sweep)
    assertPoint(arc.pointAt(0.25), reversed.pointAt(0.75))
    assertPoint(Point2(0.7071067811865483, -4.949747468305833), arc.pointAt(0.5))
    assertBounds(-5.0, -5.0, 5.0, 4.0, segmentBounds(listOf(arc)))
    assertEquals(4.0, arc.distanceTo(Point2(9.0, 0.0)), EPS)
    assertEquals(23, arc.sample().size)
  }

  @Test
  fun `full circle with coincident endpoints keeps extent length and signed area`() {
    val start = Point2(3.0, 4.0)
    val circle = ArcSegment(start, start, Point2(0.0, 0.0), 2 * PI)

    assertPoint(Point2(-3.0, -4.0), circle.pointAt(0.5))
    assertBounds(-5.0, -5.0, 5.0, 5.0, segmentBounds(listOf(circle)))
    assertEquals(10 * PI, circle.length, EPS)
    assertEquals(25 * PI, signedArea(listOf(circle)), EPS)
    assertEquals(-25 * PI, signedArea(listOf(circle.reversed())), EPS)
    assertEquals(30, circle.sample().size)
    assertEquals(3143, circle.sample(tolerance = 0.0).size)
  }

  @Test
  fun `three point arc follows the middle point at large drawing coordinates`() {
    val start = Point2(1e9 + 8, -1e9)
    val through = Point2(1e9 - 8, -1e9)
    val end = Point2(1e9, -1e9 + 8)
    val arc = assertNotNull(arcThroughPoints(start, through, end))

    assertPoint(Point2(1e9, -1e9), arc.center)
    assertEquals(-3 * PI / 2, arc.sweep, EPS)
    assertPoint(through, arc.pointAt(2.0 / 3.0))
    assertPoint(end, arc.pointAt(1.0))

    assertNull(arcThroughPoints(start, start, end))
    assertNull(arcThroughPoints(Point2(0.0, 0.0), Point2(1.0, 1.0), Point2(2.0, 2.0)))
    assertNull(arcThroughPoints(Point2(Double.NaN, 0.0), through, end))
  }

  @Test
  fun `DXF bulge keeps clockwise orientation and permits sweeps above a semicircle`() {
    val start = Point2(0.0, 0.0)
    val end = Point2(8.0, 0.0)
    val positive = assertIs<ArcSegment>(segmentFromBulge(start, end, 2.0))
    val negative = assertIs<ArcSegment>(segmentFromBulge(start, end, -2.0))

    assertPoint(Point2(4.0, -3.0), positive.center)
    assertPoint(Point2(4.0, 3.0), negative.center)
    assertEquals(4.428594871176362, positive.sweep, EPS)
    assertEquals(-positive.sweep, negative.sweep, EPS)
    assertPoint(end, negative.pointAt(1.0))
    assertEquals(LineSegment(start, end), segmentFromBulge(start, end, 1e-12))
    assertFailsWith<IllegalArgumentException> { segmentFromBulge(start, start, 1.0) }
  }

  @Test
  fun `flatten removes only shared joins and keeps disjoint endpoints`() {
    val a = Point2(0.0, 0.0)
    val b = Point2(1.0, 1.0)
    val c = Point2(2.0, 1.0)
    val d = Point2(3.0, 4.0)
    val e = Point2(5.0, 4.0)

    assertEquals(listOf(a, b, c, d, e), flattenSegments(listOf(
      LineSegment(a, b), LineSegment(b, c), LineSegment(d, e),
    )))
    assertEquals(emptyList(), flattenSegments(emptyList()))
    assertBounds(-20.0, -20.0, 20.0, 20.0, segmentBounds(emptyList()))
  }

  private fun assertPoint(expected: Point2, actual: Point2) {
    assertEquals(expected.x, actual.x, EPS)
    assertEquals(expected.y, actual.y, EPS)
  }

  private fun assertBounds(minX: Double, minY: Double, maxX: Double, maxY: Double, bounds: Bounds2) {
    assertEquals(minX, bounds.minX, EPS)
    assertEquals(minY, bounds.minY, EPS)
    assertEquals(maxX, bounds.maxX, EPS)
    assertEquals(maxY, bounds.maxY, EPS)
  }

  companion object {
    private const val EPS = 1e-10
  }
}
