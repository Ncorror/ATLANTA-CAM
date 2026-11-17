import { fmt } from "./format.js";

export const LEGACY_REFERENCE_Z = 30;

/** Height of the contact surface in the chosen part coordinate system. */
export function referenceSurfaceZ(config, bounds, hasGeometry = true) {
  if (config.zReferenceSurfaceMode === "manual") return config.zReferenceSurfaceZ;
  if (config.zReferenceSurfaceMode && config.zReferenceSurfaceMode !== "top")
    throw Error("Выбери поверхность для привязки Z.");
  if (!config.workPlane || config.workPlane === "xy") return config.topZ;
  if (!hasGeometry) return 0;
  return bounds.maxY - config.originY;
}

/** Physical Z coordinate of the cutter centre during touch-off. All inputs are millimetres. */
export function calculateZReference({ plate, radius, surfaceZ = 0 }) {
  if (!Number.isFinite(plate) || plate <= 0)
    throw Error("Высота плитки должна быть положительным числом в миллиметрах.");
  if (!Number.isFinite(radius) || radius < 0)
    throw Error("Проверь физический радиус инструмента для привязки Z.");
  if (!Number.isFinite(surfaceZ))
    throw Error("Укажи высоту поверхности касания относительно нуля детали.");
  const z = surfaceZ + plate + radius;
  if (!Number.isFinite(z) || Math.abs(z) > 999.999)
    throw Error("Координата привязки Z выходит за диапазон ±999,999 мм.");
  return z;
}

/** Preserve legacy projects unless their operation explicitly selects plate touch-off. */
export function zReference(config) {
  if (config.zReferenceEnabled !== true) return { z: LEGACY_REFERENCE_Z, command: "G92X0Y0Z30000" };
  const plate = config.zReferencePlate;
  const diameter = config.diameter;
  if (!Number.isFinite(diameter) || diameter <= 0)
    throw Error("Для привязки Z укажи положительный диаметр фрезы.");
  const radius = diameter / 2;
  const surfaceZ = config.zReferenceSurfaceZ;
  const z = calculateZReference({ plate, radius, surfaceZ });
  const scale = config.coordScale || 1000;
  const encoded = fmt(z, scale, false);
  return {
    z: Number(encoded) / scale,
    plate,
    radius,
    surfaceZ,
    command: "G92X0Y0Z" + encoded,
    comment: "Plitka = " + String(Number(plate.toFixed(6))),
    commentSpace: true,
  };
}
