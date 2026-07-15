import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import UploadPage from "./pages/UploadPage";
import ResultsPage from "./pages/ResultsPage";
import BatchPage from "./pages/BatchPage";
import AnalyticsPage from "./pages/AnalyticsPage";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<UploadPage />} />
        <Route path="/result" element={<ResultsPage />} />
        <Route path="/batch" element={<BatchPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
      </Routes>
    </Layout>
  );
}
