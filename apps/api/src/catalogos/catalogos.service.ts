import { Injectable, NotFoundException } from '@nestjs/common';
import type { CategoriaEstudio, EstatusClinica } from '@salud-digna/shared';
import { CLINICAS_DEMO, ClinicaDemo, ESTUDIOS_DEMO, EstudioDemo } from './datos-demo';

@Injectable()
export class CatalogosService {
  private readonly estudios: EstudioDemo[] = ESTUDIOS_DEMO.map((e) => ({ ...e }));
  private readonly clinicas: ClinicaDemo[] = CLINICAS_DEMO.map((c) => ({ ...c }));

  listarEstudios(filtros?: { categoria?: CategoriaEstudio; q?: string }): EstudioDemo[] {
    const q = filtros?.q?.trim().toLowerCase();
    return this.estudios.filter((e) => {
      if (!e.activo) return false;
      if (filtros?.categoria && e.categoria !== filtros.categoria) return false;
      if (q && !e.nombre.toLowerCase().includes(q) && !e.codigo.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }

  obtenerEstudioPorId(id: string): EstudioDemo {
    const estudio = this.estudios.find((e) => e.id === id || e.codigo === id);
    if (!estudio) throw new NotFoundException(`Estudio ${id} no encontrado`);
    return estudio;
  }

  listarClinicas(filtros?: { region?: string; estatus?: EstatusClinica }): ClinicaDemo[] {
    return this.clinicas.filter((c) => {
      if (filtros?.region && c.region.toLowerCase() !== filtros.region.toLowerCase()) return false;
      if (filtros?.estatus && c.estatus !== filtros.estatus) return false;
      return true;
    });
  }

  obtenerClinicaPorId(id: string): ClinicaDemo {
    const clinica = this.clinicas.find((c) => c.id === id || c.codigo === id);
    if (!clinica) throw new NotFoundException(`Clínica ${id} no encontrada`);
    return clinica;
  }

  actualizarEstatusClinica(
    id: string,
    estatus: EstatusClinica,
    mensajeEstatus: string | null = null,
  ): ClinicaDemo {
    const clinica = this.obtenerClinicaPorId(id);
    clinica.estatus = estatus;
    clinica.mensajeEstatus = mensajeEstatus;
    return clinica;
  }
}
