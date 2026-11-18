package cam.atlanta.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class WorkPlaneTest {
  @Test
  fun `resolves each plane by project ID and FANUC code`() {
    val planes = listOf(
      Triple(WorkPlane.XY, "xy", 17),
      Triple(WorkPlane.ZX, "zx", 18),
      Triple(WorkPlane.YZ, "yz", 19),
    )

    for ((plane, id, code) in planes) {
      assertEquals(id, plane.id)
      assertEquals(code, plane.code)
      assertEquals(plane, WorkPlane.fromId(id))
      assertEquals(plane, WorkPlane.fromCode(code))
    }
    assertEquals(WorkPlane.ZX, WorkPlane.fromId("xz"))
    assertFailsWith<IllegalArgumentException> { WorkPlane.fromId("17") }
    assertFailsWith<IllegalArgumentException> { WorkPlane.fromCode(20) }
  }

  @Test
  fun `converts local and world coordinates for all planes`() {
    val local = Point3(10.0, 20.0, -3.0)

    val worldPoints = mapOf(
      WorkPlane.XY to Point3(10.0, 20.0, -3.0),
      WorkPlane.ZX to Point3(10.0, -3.0, 20.0),
      WorkPlane.YZ to Point3(-3.0, 10.0, 20.0),
    )
    for ((plane, world) in worldPoints) {
      assertEquals(world, plane.toWorld(local), plane.id)
      assertEquals(local, plane.toLocal(world), plane.id)
    }
    assertEquals(Point3(0.0, 10.0, 20.0), WorkPlane.YZ.toWorld(Point3(10.0, 20.0)))
  }

  @Test
  fun `leaves XY commands unchanged in both directions`() {
    val command = "  g 017 x +0001.00 y -.5 (G03X9)\r\ng02i .5 ; Z123"
    assertEquals(command, WorkPlane.XY.remapCommand(command))
    assertEquals(command, WorkPlane.XY.remapCommand(command, inverse = true))
  }

  @Test
  fun `maps YZ coordinates and offsets without reformatting numeric words`() {
    val local = "G17G01 X +001.250 y -.25 z 1. I +0 J -.500 k +03 f 010"
    val world = "G19G01 Y+001.250 Z-.25 X1. J+0 K-.500 I+03 F010"

    assertEquals(world, WorkPlane.YZ.remapCommand(local))
    assertEquals(
      "G17G01 X+001.250 Y-.25 Z1. I+0 J-.500 K+03 F010",
      WorkPlane.YZ.remapCommand(world, inverse = true),
    )
  }

  @Test
  fun `reverses arc and compensation directions on ZX`() {
    val local = "G017G3G041 X+0001 Y-.5 I1. J+00. K-0"
    val world = "G18G02G42 X+0001 Z-.5 I1. K+00. J-0"

    assertEquals(world, WorkPlane.ZX.remapCommand(local))
    assertEquals(
      "G17G03G41 X+0001 Y-.5 I1. J+00. K-0",
      WorkPlane.ZX.remapCommand(world, inverse = true),
    )
    assertEquals("G03G41 X1Z2Y3I4K5J6", WorkPlane.ZX.remapCommand("G02G42 X1Y2Z3I4J5K6"))
  }

  @Test
  fun `keeps parenthesized comments and semicolon comments verbatim`() {
    val command = "  n 010 g 17 g 2 x +001.00 y -.500 (Y90 I2 Паз) i 2. j -03 ; g41 y03"

    assertEquals(
      "  N010 G18 G03 X+001.00 Z-.500 (Y90 I2 Паз) I2. K-03 ; g41 y03",
      WorkPlane.ZX.remapCommand(command),
    )
  }

  @Test
  fun `does not rewrite G25 or G92 blocks in any plane`() {
    val commands = listOf(" N 020 g 0025 P 001 Q 009 R 03 (I1 Y2)", "g092 X +00 Y 0 Z +30000")
    for (plane in WorkPlane.entries) {
      for (command in commands) {
        assertEquals(command, plane.remapCommand(command), plane.id)
        assertEquals(command, plane.remapCommand(command, inverse = true), plane.id)
      }
    }
  }

  @Test
  fun `remaps each line while preserving CRLF LF and standalone CR`() {
    val local = "\r\nG17G03X1Y2I3J4\r\n\rG92X0Y0Z30000\rG01X10Y20Z-5\nG1X4Y5Z6\r"
    val world = "\r\nG19G03Y1Z2J3K4\r\n\rG92X0Y0Z30000\rG01Y10Z20X-5\nG1Y4Z5X6\r"

    assertEquals(world, WorkPlane.YZ.remapCommand(local))
    assertEquals(local, WorkPlane.YZ.remapCommand(world, inverse = true))
  }
}
