import { Route, Routes, Navigate } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Lookup } from "./pages/Lookup";
import { Merchant360 } from "./pages/Merchant360";
import { Dashboard } from "./pages/Dashboard";
import { ModelPage } from "./pages/ModelPage";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Lookup />} />
        <Route path="/merchant/:id" element={<Merchant360 />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/model" element={<ModelPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
