package cam.atlanta.core

import java.math.BigDecimal
import java.math.RoundingMode
import kotlin.math.abs
import kotlin.math.roundToLong

enum class WorkPlane { XY, ZX, YZ }

/** Physical Z in millimetres, quantized to the coordinate written in the FANUC block. */
data class ZReferenceFrame(val z: Double, val command: String, val comment: String? = null)

object ZReference {
  private const val COORDINATE_SCALE = 1000.0
  private const val MAX_Z = 999.999

  /** Projects with the plate setting disabled or absent use the original park coordinate. */
  fun legacy(): ZReferenceFrame = ZReferenceFrame(30.0, "G92X0Y0Z30000")

  /** The XY plane uses topZ. On vertical planes the drawing's Y axis is physical Z. */
  fun surfaceFromTop(
    workPlane: WorkPlane,
    topZ: Double,
    contourMaxY: Double?,
    originY: Double,
  ): Double = when (workPlane) {
    WorkPlane.XY -> topZ
    WorkPlane.ZX, WorkPlane.YZ -> contourMaxY?.let { it - originY } ?: 0.0
  }

  /** The diameter is physical, independent of the radius used for a cutting pass. */
  fun forPlate(plate: Double, toolDiameter: Double, surfaceZ: Double): ZReferenceFrame {
    require(toolDiameter.isFinite() && toolDiameter > 0.0) {
      "Для привязки Z укажи положительный диаметр фрезы."
    }
    require(plate.isFinite() && plate > 0.0) {
      "Высота плитки должна быть положительным числом в миллиметрах."
    }
    require(surfaceZ.isFinite()) {
      "Укажи высоту поверхности касания относительно нуля детали."
    }
    val z = surfaceZ + plate + toolDiameter / 2.0
    require(z.isFinite() && abs(z) <= MAX_Z) {
      "Координата привязки Z выходит за диапазон ±999,999 мм."
    }

    // Like Math.round in the web engine, exact ties round toward positive infinity.
    val encodedZ = (z * COORDINATE_SCALE).roundToLong()
    // Round the exact Double value, matching the web engine's toFixed(6) for plate dimensions.
    val plateLabel = BigDecimal(plate)
      .setScale(6, RoundingMode.HALF_UP)
      .stripTrailingZeros()
      .toPlainString()
    return ZReferenceFrame(encodedZ / COORDINATE_SCALE, "G92X0Y0Z$encodedZ", "Plitka = $plateLabel")
  }
}
