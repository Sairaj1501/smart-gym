export const BMI_NOTE =
  'BMI is a rough screening ratio. It ignores muscle mass, bone density, age, sex and body-fat distribution, ' +
  'and standard cut-offs may not suit every population. It is not a diagnosis; discuss health questions with a qualified professional.';

export function calcBmi(weightKg, heightCm) {
  if (!(weightKg >= 20 && weightKg <= 400)) throw new RangeError('Weight must be between 20 and 400 kg');
  if (!(heightCm >= 80 && heightCm <= 250)) throw new RangeError('Height must be between 80 and 250 cm');
  const h = heightCm / 100;
  return Math.round((weightKg / (h * h)) * 10) / 10;
}

/** Neutral, non-diagnostic wording based on the standard adult reference ranges. */
export function bmiBand(bmi) {
  if (bmi == null) return null;
  if (bmi < 18.5) return 'Below the standard adult reference range';
  if (bmi < 25) return 'Within the standard adult reference range';
  if (bmi < 30) return 'Above the standard adult reference range';
  return 'Well above the standard adult reference range';
}
