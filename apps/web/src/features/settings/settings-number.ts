/** Text inputs retain Arabic digits until we can normalize them. Never coerce an empty draft to zero. */
export { readNumberInput as readSettingsNumber } from "@/lib/utils/number";
