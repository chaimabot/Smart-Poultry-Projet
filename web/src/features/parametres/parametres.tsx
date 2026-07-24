// pages/parametres/Parametres.tsx
import { useState, useEffect } from "react";
import { parametresAPI } from "../../services/api";
import Header from "../../components/layout/Header";
import Sidebar from "../../components/layout/Sidebar";

interface Seuils {
  temperatureMin?: number;
  temperatureMax?: number;
  humidityMin?: number;
  humidityMax?: number;
  airQualityMin?: number;
  waterLevelMin?: number;
}

const DEFAULT_SEUILS: Seuils = {
  temperatureMin: 18,
  temperatureMax: 28,
  humidityMin: 40,
  humidityMax: 70,
  airQualityMin: 50,
  waterLevelMin: 20,
};

export default function Parametres() {
  const [seuils, setSeuils] = useState<Seuils>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const fetchParametres = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await parametresAPI.get();
      console.log("📥 fetchParametres response:", response.data);
      if (response.data.defaults) {
        setSeuils(response.data.defaults);
      }
    } catch (err: any) {
      console.error("Erreur fetchParametres:", err);
      setError(err.response?.data?.error || "Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchParametres();
  }, []);

  const handleChange = (field: keyof Seuils, value: string) => {
    const numValue = parseFloat(value);
    setSeuils((prev) => ({
      ...prev,
      [field]: isNaN(numValue) ? undefined : numValue,
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const response = await parametresAPI.update({ thresholds: seuils });
      console.log("✅ handleSave response:", response.data);

      // Recharger depuis la DB pour confirmer la persistance
      await fetchParametres();

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      console.error("Erreur saveParametres:", err);
      setError(err.response?.data?.error || "Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setSeuils(DEFAULT_SEUILS);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <Header />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-6 lg:p-8">
          {/* Page Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
              Paramètres Système
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
              Configurez les seuils par défaut appliqués aux nouveaux
              poulaillers
            </p>
          </div>

          {/* Alerts */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}
          {success && (
            <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <p className="text-green-600 dark:text-green-400">
                Paramètres enregistrés avec succès !
              </p>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm">
              {/* Card Header */}
              <div className="p-6 border-b border-slate-200 dark:border-slate-700">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                  Seuils par Défaut
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Ces valeurs seront appliquées automatiquement aux nouveaux
                  poulaillers
                </p>
              </div>

              {/* Fields */}
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {/* Température */}
                  <div className="space-y-4">
                    <h3 className="font-medium text-slate-900 dark:text-white flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary">
                        thermostat
                      </span>
                      Température (°C)
                    </h3>
                    <div>
                      <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">
                        Min
                      </label>
                      <input
                        type="number"
                        value={seuils.temperatureMin ?? ""}
                        onChange={(e) =>
                          handleChange("temperatureMin", e.target.value)
                        }
                        className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                        placeholder="18"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">
                        Max
                      </label>
                      <input
                        type="number"
                        value={seuils.temperatureMax ?? ""}
                        onChange={(e) =>
                          handleChange("temperatureMax", e.target.value)
                        }
                        className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                        placeholder="28"
                      />
                    </div>
                  </div>

                  {/* Humidité */}
                  <div className="space-y-4">
                    <h3 className="font-medium text-slate-900 dark:text-white flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary">
                        water_drop
                      </span>
                      Humidité (%)
                    </h3>
                    <div>
                      <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">
                        Min
                      </label>
                      <input
                        type="number"
                        value={seuils.humidityMin ?? ""}
                        onChange={(e) =>
                          handleChange("humidityMin", e.target.value)
                        }
                        className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                        placeholder="40"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">
                        Max
                      </label>
                      <input
                        type="number"
                        value={seuils.humidityMax ?? ""}
                        onChange={(e) =>
                          handleChange("humidityMax", e.target.value)
                        }
                        className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                        placeholder="70"
                      />
                    </div>
                  </div>

                  {/* Qualité de l'air */}
                  <div className="space-y-4">
                    <h3 className="font-medium text-slate-900 dark:text-white flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary">
                        air
                      </span>
                      Qualité de l'air (IAQ)
                    </h3>
                    <div>
                      <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">
                        Min acceptable
                      </label>
                      <input
                        type="number"
                        value={seuils.airQualityMin ?? ""}
                        onChange={(e) =>
                          handleChange("airQualityMin", e.target.value)
                        }
                        className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                        placeholder="50"
                      />
                    </div>
                  </div>

                  {/* Niveau d'eau */}
                  <div className="space-y-4">
                    <h3 className="font-medium text-slate-900 dark:text-white flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary">
                        water
                      </span>
                      Niveau d'eau (%)
                    </h3>
                    <div>
                      <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">
                        Min
                      </label>
                      <input
                        type="number"
                        value={seuils.waterLevelMin ?? ""}
                        onChange={(e) =>
                          handleChange("waterLevelMin", e.target.value)
                        }
                        className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                        placeholder="20"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="p-6 border-t border-slate-200 dark:border-slate-700 flex justify-between">
                <button
                  onClick={handleReset}
                  className="px-5 py-2.5 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
                >
                  Réinitialiser
                </button>
                <div className="flex gap-4">
                  <button
                    onClick={fetchParametres}
                    className="px-5 py-2.5 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-6 py-2.5 bg-primary hover:bg-primary-dark text-white font-medium rounded-lg shadow-md transition-all duration-200 disabled:opacity-70"
                  >
                    {saving ? "Enregistrement..." : "Enregistrer"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
