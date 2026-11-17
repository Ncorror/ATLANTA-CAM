export const NAMES = {
  select: "Выбор",
  machining: "В обработку / снять отметку",
  erase: "Стереть элемент",
  line: "Линия плана",
  guide: "Вспомогательная прямая",
  auxErase: "Удалить вспомогательные рамкой",
  arc: "Дуга",
  arcRadius: "Дуга R/°",
  circle: "Окружность",
  rect: "Прямоугольник",
  fillet: "Скругление R",
  chamfer: "Фаска C",
  trim: "Обрезать",
  split: "Разделить",
  paste: "Вставка",
  ruler: "Линейка / Размер",
};

export const SHAPES = ["line", "arc", "circle", "rect"];

export const FIELD_NAMES = {
  ax: "Начало X",
  ay: "Начало Y",
  bx: "Конец X",
  by: "Конец Y",
  mx: "Точка дуги X",
  my: "Точка дуги Y",
  cx: "Центр X",
  cy: "Центр Y",
  dia: "Диаметр",
  w: "Ширина",
  h: "Высота",
  length: "Длина",
  angle: "Угол, °",
};

export const FIELD_DEFAULTS = {
  ax: 0,
  ay: 0,
  bx: 20,
  by: 0,
  mx: 10,
  my: 10,
  cx: 0,
  cy: 0,
  dia: 5,
  w: 40,
  h: 30,
  length: 20,
  angle: 0,
};
