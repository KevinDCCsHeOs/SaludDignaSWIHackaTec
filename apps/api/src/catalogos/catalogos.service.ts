import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import type { CategoriaEstudio, EstatusClinica } from '@salud-digna/shared';
import { KeyValueStoreService } from '../common/redis/kv-store.service';
import { CLINICAS_DEMO, ClinicaDemo, ESTUDIOS_DEMO, EstudioDemo } from './datos-demo';

const TTL_CACHE_CATALOGOS_SEG = 600; // 10 minutos en Redis (#37)

@Injectable()
export class CatalogosService {
  private readonly estudios: EstudioDemo[] = ESTUDIOS_DEMO.map((e) => ({ ...e }));
  private readonly clinicas: ClinicaDemo[] = CLINICAS_DEMO.map((c) => ({ ...c }));

  constructor(@Optional() private readonly kv?: KeyValueStoreService) {}

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

  /** Consulta de catálogo de estudios con caché en Redis (TTL 10 min, #37). */
  async listarEstudiosCacheados(filtros?: {
    categoria?: CategoriaEstudio;
    q?: string;
  }): Promise<{ estudios: EstudioDemo[]; origen: 'cache_redis' | 'catalogo' }> {
    const clave = `cat:estudios:${filtros?.categoria ?? 'all'}:${(filtros?.q ?? '').trim().toLowerCase()}`;
    if (this.kv) {
      const hit = await this.kv.get(clave);
      if (hit) {
        try {
          return { estudios: JSON.parse(hit) as EstudioDemo[], origen: 'cache_redis' };
        } catch {
          // Ignora entrada corrupta
        }
      }
    }
    const estudios = this.listarEstudios(filtros);
    if (this.kv) {
      await this.kv.set(clave, JSON.stringify(estudios), TTL_CACHE_CATALOGOS_SEG);
    }
    return { estudios, origen: 'catalogo' };
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

  /** Consulta de clínicas con caché en Redis (TTL 10 min, invalidado al cambiar estatus, #37). */
  async listarClinicasCacheadas(filtros?: {
    region?: string;
    estatus?: EstatusClinica;
  }): Promise<{ clinicas: ClinicaDemo[]; origen: 'cache_redis' | 'catalogo' }> {
    const clave = `cat:clinicas:${(filtros?.region ?? 'all').toLowerCase()}:${filtros?.estatus ?? 'all'}`;
    if (this.kv) {
      const hit = await this.kv.get(clave);
      if (hit) {
        try {
          return { clinicas: JSON.parse(hit) as ClinicaDemo[], origen: 'cache_redis' };
        } catch {
          // Ignora entrada corrupta
        }
      }
    }
    const clinicas = this.listarClinicas(filtros);
    if (this.kv) {
      await this.kv.set(clave, JSON.stringify(clinicas), TTL_CACHE_CATALOGOS_SEG);
    }
    return { clinicas, origen: 'catalogo' };
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
    if (this.kv) {
      const reg = clinica.region.toLowerCase();
      void Promise.all([
        this.kv.del('cat:clinicas:all:all'),
        this.kv.del(`cat:clinicas:${reg}:all`),
      ]);
    }
    return clinica;
  }
}
