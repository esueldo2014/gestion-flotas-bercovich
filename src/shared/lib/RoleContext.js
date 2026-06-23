import { createContext, useContext } from 'react';

export const RoleContext = createContext(null);

export function useRole() {
  return useContext(RoleContext);
}

// helpers de permisos
export const can = {
  verCostos:        (rol) => ['Mecánico', 'Supervisor', 'Gerencia'].includes(rol),
  editarMaquinas:   (rol) => ['Supervisor', 'Gerencia'].includes(rol),
  editarPlan:       (rol) => ['Supervisor', 'Gerencia'].includes(rol),
  cerrarOT:         (rol) => ['Mecánico', 'Supervisor', 'Gerencia'].includes(rol),
  verDashboard:     (rol) => ['Supervisor', 'Gerencia'].includes(rol),
  verTodosDepositos:(rol) => rol === 'Gerencia',

  // mantenimiento edilicio
  gestionarCotizaciones: (rol) => ['Mecánico', 'Supervisor', 'Gerencia'].includes(rol),
  aprobarEdilicio:       (rol) => rol === 'Gerencia',
  ejecutarCerrarEdilicio:(rol) => ['Supervisor', 'Gerencia'].includes(rol),

  // rrhh
  registrarCapacitacion:   (rol) => ['Supervisor', 'Gerencia'].includes(rol),
  generarCompensatorio:    (rol) => ['Supervisor', 'Gerencia'].includes(rol),
  aprobarSolicitudRRHH:    (rol) => ['Supervisor', 'Gerencia'].includes(rol), // HHEE, compensatorios, vacaciones
  asignarVacaciones:       (rol) => rol === 'Gerencia',
  verInformeRRHH:          (rol) => rol === 'Gerencia',
};
