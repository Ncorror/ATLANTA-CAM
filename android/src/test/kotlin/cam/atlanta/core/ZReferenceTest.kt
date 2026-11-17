package cam.atlanta.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class ZReferenceTest {
  @Test
  fun `legacy reference returns fixed Z30 without a plate comment`() {
    assertEquals(ZReferenceFrame(30.0, "G92X0Y0Z30000"), ZReference.legacy())
  }

  @Test
  fun `plate reference uses the physical tool radius and contact surface`() {
    assertEquals(
      ZReferenceFrame(35.0, "G92X0Y0Z35000", "Plitka = 30"),
      ZReference.forPlate(30.0, 10.0, 0.0),
    )
    assertEquals(
      ZReferenceFrame(38.0, "G92X0Y0Z38000", "Plitka = 30"),
      ZReference.forPlate(30.0, 16.0, 0.0),
    )
    assertEquals(
      ZReferenceFrame(47.5, "G92X0Y0Z47500", "Plitka = 30"),
      ZReference.forPlate(30.0, 10.0, 12.5),
    )
    assertEquals(
      ZReferenceFrame(33.0, "G92X0Y0Z33000", "Plitka = 25"),
      ZReference.forPlate(25.0, 16.0, 0.0),
    )
  }

  @Test
  fun `plate comment rounds to six decimals and omits trailing zeros`() {
    assertEquals("Plitka = 30.123457", ZReference.forPlate(30.1234567, 10.0, 0.0).comment)
    assertEquals("Plitka = 30.125", ZReference.forPlate(30.1250001, 10.0, 0.0).comment)
  }

  @Test
  fun `top surface follows the physical Z of the selected work plane`() {
    assertEquals(-3.0, ZReference.surfaceFromTop(WorkPlane.XY, -3.0, 25.0, 10.0))
    assertEquals(0.0, ZReference.surfaceFromTop(WorkPlane.ZX, -3.0, 25.0, 25.0))
    assertEquals(12.5, ZReference.surfaceFromTop(WorkPlane.YZ, -3.0, 25.0, 12.5))
    assertEquals(0.0, ZReference.surfaceFromTop(WorkPlane.ZX, -3.0, null, 10.0))
    assertEquals(0.0, ZReference.surfaceFromTop(WorkPlane.YZ, -3.0, null, 10.0))
  }

  @Test
  fun `coordinate rounding sends half steps toward positive infinity`() {
    assertEquals(
      ZReferenceFrame(0.063, "G92X0Y0Z63", "Plitka = 0.03125"),
      ZReference.forPlate(0.03125, 0.0625, 0.0),
    )
    assertEquals(
      ZReferenceFrame(-0.062, "G92X0Y0Z-62", "Plitka = 0.03125"),
      ZReference.forPlate(0.03125, 0.0625, -0.125),
    )
  }

  @Test
  fun `negative values close to zero produce a positive zero coordinate`() {
    val frame = ZReference.forPlate(0.0005, 0.001, -0.0015)

    assertEquals("G92X0Y0Z0", frame.command)
    assertEquals(0.0.toRawBits(), frame.z.toRawBits())
  }

  @Test
  fun `rejects invalid plate tool and surface values`() {
    val invalidDimensions = listOf(
      0.0,
      -1.0,
      Double.NaN,
      Double.POSITIVE_INFINITY,
      Double.NEGATIVE_INFINITY,
    )
    for (value in invalidDimensions) {
      assertFailsWith<IllegalArgumentException> { ZReference.forPlate(value, 10.0, 0.0) }
      assertFailsWith<IllegalArgumentException> { ZReference.forPlate(30.0, value, 0.0) }
    }
    for (surface in listOf(Double.NaN, Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY)) {
      assertFailsWith<IllegalArgumentException> { ZReference.forPlate(30.0, 10.0, surface) }
    }
  }

  @Test
  fun `checks both physical coordinate limits before rounding`() {
    assertEquals(999.999, ZReference.forPlate(1.0, 2.0, 997.999).z)
    assertEquals(-999.999, ZReference.forPlate(1.0, 2.0, -1001.999).z)
    assertFailsWith<IllegalArgumentException> { ZReference.forPlate(1.0, 2.0, 997.9991) }
    assertFailsWith<IllegalArgumentException> { ZReference.forPlate(1.0, 2.0, -1001.9991) }
  }
}
