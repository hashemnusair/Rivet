import { redirect } from "next/navigation";

/**
 * There is one sign-in portal for the whole product (`/login`). This route only
 * exists so older links and bookmarks still land on the member tab.
 */
export default function CustomerLoginRedirect() {
  redirect("/login/member");
}
