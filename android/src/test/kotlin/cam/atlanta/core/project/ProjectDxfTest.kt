package cam.atlanta.core.project

import cam.atlanta.core.geometry.segmentBounds
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import kotlin.test.assertNull

class ProjectDxfTest {
  private val original = ProjectV5Codec.decode(
    checkNotNull(javaClass.getResourceAsStream("/operation-project.json")).bufferedReader().use { it.readText() },
  )

  @Test
  fun `restores embedded DXF at the saved project scale and tolerances`() {
    val values = JsonObject(original.values.json + ("dxfUnits" to JsonPrimitive("25.4")))
    val project = ProjectV5Codec.fromJson(
      JsonObject(original.json + mapOf("sketch" to JsonNull, "values" to values)),
    )
    val drawing = assertNotNull(project.embeddedDxf())
    val contour = drawing.plan.contours.single()
    assertEquals(25.4, drawing.factor)
    assertEquals(true, contour.closed)
    assertEquals(762.0, segmentBounds(contour.segments).maxX, 1e-9)
    assertEquals(original.rawDxf, ProjectV5Codec.decode(ProjectV5Codec.encode(project)).rawDxf)
  }

  @Test
  fun `uses the saved sketch instead of a malformed or stale DXF cache`() {
    val document = ProjectV5Codec.fromJson(JsonObject(original.json + ("rawDxf" to JsonPrimitive("bad DXF"))))
    assertNull(document.embeddedDxf())
    assertEquals(1, assertNotNull(document.sketchScene()).plan.contours.size)

    val sketch = original.json.getValue("sketch").jsonObject
    val emptySketch = JsonObject(sketch + ("items" to JsonArray(emptyList())))
    assertNull(ProjectV5Codec.fromJson(JsonObject(original.json + ("sketch" to emptySketch))).embeddedDxf())
  }

  @Test
  fun `rejects an invalid saved scale when parsing embedded DXF`() {
    val values = JsonObject(original.values.json + ("dxfUnits" to JsonPrimitive("bad scale")))
    val project = ProjectV5Codec.fromJson(JsonObject((original.json - "sketch") + ("values" to values)))
    assertFailsWith<IllegalArgumentException> { project.embeddedDxf() }
  }
}
