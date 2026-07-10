/** Quick-add calorie buttons for foods eaten often. Editable here. */
export type CaloriePreset = { label: string; calories: number }

export const CALORIE_PRESETS: CaloriePreset[] = [
  { label: 'Work meal', calories: 500 },
  { label: 'Protein shake', calories: 300 },
  { label: 'Protein smoothie', calories: 750 },
]
