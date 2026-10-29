import { redirect } from "next/navigation";

/** Gym access is issued by RIVET; there is no self-serve gym sign-up route. */
export default function LegacyGymSignUpPage() {
  redirect("/signup");
}
