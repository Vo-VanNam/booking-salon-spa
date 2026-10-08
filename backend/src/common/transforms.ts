import { Transform } from 'class-transformer';

/** Chấp nhận cả số và chuỗi số (form-data / query param) cho các field số. */
export function ToNumber(): PropertyDecorator {
  return Transform(({ value }) => {
    if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) return Number(value);
    return value;
  });
}

export function ToBoolean(): PropertyDecorator {
  return Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  });
}
