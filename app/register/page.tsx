import { RegisterForm } from "./register-form";

// Mitgliedsantrag als Wizard. Rahmen (rote Markenfläche mit Fortschritt und
// Zusammenfassung) und Formular liegen zusammen in RegisterForm, weil die
// Zusammenfassung aus dem Formularzustand entsteht.
export default function RegisterPage() {
  return <RegisterForm />;
}
