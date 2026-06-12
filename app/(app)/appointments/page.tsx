import { redirect } from "next/navigation"

// La agenda vive en /agenda (vista diaria por cabinas).
export default function AppointmentsRedirect() {
  redirect("/agenda")
}
