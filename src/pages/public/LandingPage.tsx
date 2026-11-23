import React, { useEffect, useState } from "react";
import { Navbar } from "../../components/Navbar";
import { LandingHero } from "../../components/public/landing/LandingHero";
import { LandingFeatures } from "../../components/public/landing/LandingFeatures";
import { LandingStoreShowcase } from "../../components/public/landing/LandingStoreShowcase";
import { LandingFaq } from "../../components/public/landing/LandingFaq";
import { LandingCta } from "../../components/public/landing/LandingCta";
import { LandingFooter } from "../../components/public/landing/LandingFooter";
import { api } from "../../config/api";

/**
 * Página de aterrizaje (Landing Page) principal.
 * Orquesta la composición de las secciones públicas y gestiona 
 * la carga inicial de datos dinámicos (tiendas destacadas).
 */
export const LandingPage: React.FC = () => {
  // Almacena la lista de tiendas destacadas obtenidas desde la API
  // Nota: Se recomienda definir una interfaz `Store` en el futuro para reemplazar `any[]`
  const [stores, setStores] = useState<any[]>([]);

  // Carga las tiendas destacadas al montar el componente
  useEffect(() => {
    api.get("/api/stores/public/featured")
      .then((res) => {
        if (res.data?.success) {
          setStores(res.data.stores);
        }
      })
      .catch((err) => {
        console.error("Failed to fetch featured stores:", err);
      });
  }, []); // El array vacío asegura que solo se ejecute una vez al montar

  return (
    // Contenedor principal con altura mínima, fondo blanco y tipografía base
    <div className="min-h-screen bg-white text-neutral-900 flex flex-col font-sans">
      <Navbar />

      {/* Secciones principales de la Landing Page en orden de aparición */}
      <LandingHero />
      <LandingFeatures />

      {/* Sección dinámica que recibe los datos fetcheados */}
      <LandingStoreShowcase stores={stores} />

      <LandingFaq />
      <LandingCta />
      <LandingFooter />
    </div>
  );
};