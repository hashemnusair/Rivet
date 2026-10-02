/** Money shared by browser and backend helpers without frontend-only imports. */
export interface Money {
  /** Integer minor units. JOD has 3 decimal places: 40_000 = JOD 40.000. */
  amount: number;
  currency: string;
}
