import { createContext, useContext } from 'react';

export const RoleContext = createContext(null);

export function useRole() {
  return useContext(RoleContext);
}

// helpers de permisos
export const can = {
  verCostos:        (rol) => ['Mecánico', 'Jefe', 'Gerencia'].includes(rol),
  editarMaquinas:   (rol) => ['Jefe', 'Gerencia'].includes(rol),
  editarPlan:       (rol) => ['Jefe', 'Gerencia'].includes(rol),
  cerrarOT:         (rol) => ['Mecánico', 'Jefe', 'Gerencia'].includes(rol),
  verDashboard:     (rol) => ['Jefe', 'Gerencia'].includes(rol),
  verTodosDepositos:(rol) => rol === 'Gerencia',

  // mantenimiento edilicio
  gestionarCotizaciones: (rol) => ['Mecánico', 'Jefe', 'Gerencia'].includes(rol),
  aprobarEdilicio:       (rol) => rol === 'Gerencia',
  ejecutarCerrarEdilicio:(rol) => ['Jefe', 'Gerencia'].includes(rol),

  // rrhh
  registrarCapacitacion:   (rol) => ['Jefe', 'Gerencia'].includes(rol),
  generarCompensatorio:    (rol) => ['EM', 'Jefe', 'Gerencia'].includes(rol),
  aprobarSolicitudRRHH:    (rol) => ['Jefe', 'Gerencia'].includes(rol), // HHEE, compensatorios, vacaciones
  asignarVacaciones:       (rol) => ['EM', 'Gerencia'].includes(rol),
  verInformeRRHH:          (rol) => rol === 'Gerencia',
  verCierreHHEE:           (rol) => ['Jefe', 'Gerencia'].includes(rol),
  gestionarEquipo:         (rol) => rol === 'Gerencia',
};
