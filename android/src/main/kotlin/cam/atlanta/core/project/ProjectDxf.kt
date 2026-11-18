package cam.atlanta.core.project

import cam.atlanta.core.dxf.DxfDrawing
import cam.atlanta.core.dxf.DxfOptions
import cam.atlanta.core.dxf.readDxf
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive

/** Uses the embedded drawing only where the project has no authoritative saved sketch. */
fun ProjectV5.embeddedDxf(): DxfDrawing? {
  val sketch = json["sketch"]
  if (rawDxf.isBlank() || (sketch != null && sketch != JsonNull)) return null

  fun setting(key: String): String? {
    val value = values.json[key] ?: return null
    if (value == JsonNull) return null
    require(value is JsonPrimitive) { "Повреждён параметр проекта: $key." }
    return value.content.trim().ifEmpty { null }
  }

  fun number(key: String, value: String): Double = value.toDoubleOrNull()
    ?: throw IllegalArgumentException("Повреждён параметр проекта: $key.")

  val scale = setting("dxfUnits") ?: "1"
  return readDxf(rawDxf, DxfOptions(
    scale = if (scale == "auto") null else number("dxfUnits", scale),
    tolerance = setting("tolerance")?.let { number("tolerance", it) } ?: 0.02,
    joinTolerance = setting("joinTolerance")?.let { number("joinTolerance", it) } ?: 0.02,
  ))
}
