package cam.atlanta.core.geometry

import kotlin.math.PI
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ContoursTest {
  @Test
  fun `removes reversed duplicates and orients the next line`() {
    val first = line(0, 0, 1, 0)
    val next = line(2, 0, 1, 0)
    val assembly = connectSegments(listOf(first, first.reversed(), next))

    val contour = assembly.contours.single()
    assertEquals("c1", contour.id)
    assertEquals(listOf(first, next.reversed()), contour.segments)
    assertFalse(contour.closed)
    assertFalse(contour.ambiguous)
    assertEquals(ContourSide.ON, contour.autoSide)
    assertEquals(listOf("Удалены совпадающие элементы: 1."), assembly.warnings)
  }

  @Test
  fun `distinguishes complementary arcs with the same endpoints and center`() {
    val center = Point2(0.0, 0.0)
    val start = Point2(2.0, 0.0)
    val end = Point2(-2.0, 0.0)
    val upper = ArcSegment(start, end, center, PI)
    val lower = ArcSegment(end, start, center, PI)
    val assembly = connectSegments(listOf(upper, upper.reversed(), lower))

    assertEquals(listOf(upper, lower), assembly.contours.single().segments)
    assertTrue(assembly.contours.single().closed)
    assertEquals(listOf("Удалены совпадающие элементы: 1."), assembly.warnings)
  }

  @Test
  fun `prefers an exact endpoint over one within tolerance`() {
    val first = line(0, 0, 10, 0)
    val near = LineSegment(Point2(10.005, 0.0), Point2(10.0, 5.0))
    val exact = line(20, 0, 10, 0)
    val assembly = connectSegments(listOf(first, near, exact))

    assertEquals(listOf("c1", "c2"), assembly.contours.map { it.id })
    assertEquals(listOf(first, exact.reversed()), assembly.contours.first().segments)
    assertEquals(listOf(near), assembly.contours.last().segments)
    assertTrue(assembly.warnings.isEmpty())
  }

  @Test
  fun `connects and closes tolerated gaps with line segments`() {
    val a = Point2(0.0, 0.0)
    val b = Point2(10.0, 0.0)
    val c = Point2(0.0, 10.0)
    val nearB = Point2(10.0, 0.004)
    val nearA = Point2(0.0, 0.005)
    val first = LineSegment(a, b)
    val second = LineSegment(nearB, c)
    val third = LineSegment(c, nearA)
    val segments = listOf(first, second, third)

    val closed = connectSegments(segments).contours.single()
    assertTrue(closed.closed)
    assertEquals(ContourSide.OUTSIDE, closed.autoSide)
    assertEquals(listOf(first, LineSegment(b, nearB), second, third, LineSegment(nearA, a)), closed.segments)

    val open = connectSegments(segments, tolerance = 0.001).contours
    assertEquals(listOf(listOf(first), listOf(second, third)), open.map { it.segments })
    assertTrue(open.none { it.closed })
  }

  @Test
  fun `follows an exact continuation before closing a nearly closed path`() {
    val a = Point2(0.0, 0.0)
    val b = Point2(10.0, 0.0)
    val nearA = Point2(0.0, 0.005)
    val c = Point2(0.0, 5.0)
    val segments = listOf(LineSegment(a, b), LineSegment(b, nearA), LineSegment(nearA, c))

    val contour = connectSegments(segments).contours.single()
    assertEquals(segments, contour.segments)
    assertFalse(contour.closed)
  }

  @Test
  fun `reports ambiguity instead of selecting a branch for the first contour`() {
    val first = line(0, 0, 10, 0)
    val straight = line(10, 0, 20, 0)
    val branch = line(10, 0, 10, 10)
    val assembly = connectSegments(listOf(first, straight, branch))

    assertEquals(listOf(first), assembly.contours.first().segments)
    assertTrue(assembly.contours.first().ambiguous)
    assertFalse(assembly.contours.first().closed)
    assertEquals(listOf(branch.reversed(), straight), assembly.contours.last().segments)
    assertTrue(assembly.warnings.single().contains("разветвления/касания"))
  }

  @Test
  fun `alternates automatic machining sides by containment depth`() {
    val segments = rectangle(0, 12) + rectangle(2, 10) + rectangle(4, 8) + line(20, 20, 21, 21)
    val contours = connectSegments(segments).contours

    assertEquals(listOf(true, true, true, false), contours.map { it.closed })
    assertEquals(listOf(0, 1, 2, 0), contours.map { it.nesting })
    assertEquals(
      listOf(ContourSide.OUTSIDE, ContourSide.INSIDE, ContourSide.OUTSIDE, ContourSide.ON),
      contours.map { it.autoSide },
    )
  }

  private fun rectangle(low: Int, high: Int): List<LineSegment> = listOf(
    line(low, low, high, low),
    line(high, low, high, high),
    line(high, high, low, high),
    line(low, high, low, low),
  )

  private fun line(x0: Int, y0: Int, x1: Int, y1: Int): LineSegment =
    LineSegment(Point2(x0.toDouble(), y0.toDouble()), Point2(x1.toDouble(), y1.toDouble()))
}
