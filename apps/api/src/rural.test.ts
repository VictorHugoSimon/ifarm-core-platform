import { describe, expect, it } from 'vitest'
import {
  fieldCreateSchema,
  geoJsonSchema,
  plotCreateSchema,
  propertyCreateSchema,
  propertyPatchSchema
} from './rural'

const organizationId = '11111111-1111-4111-8111-111111111111'

describe('CORE-005 rural validation', () => {
  it('accepts a valid Brazilian property and normalizes state/country codes', () => {
    const value = propertyCreateSchema.parse({
      organizationId,
      name: 'Fazenda Modelo',
      municipality: 'Penápolis',
      stateCode: 'sp',
      countryCode: 'br',
      totalAreaHa: 120.5,
      latitude: -21.4187,
      longitude: -50.0775
    })

    expect(value.stateCode).toBe('SP')
    expect(value.countryCode).toBe('BR')
  })

  it('rejects invalid agricultural coordinates and negative areas', () => {
    expect(propertyCreateSchema.safeParse({ organizationId, name: 'Fazenda X', totalAreaHa: -1 }).success).toBe(false)
    expect(propertyCreateSchema.safeParse({ organizationId, name: 'Fazenda X', latitude: 91 }).success).toBe(false)
    expect(propertyCreateSchema.safeParse({ organizationId, name: 'Fazenda X', longitude: -181 }).success).toBe(false)
  })

  it('requires at least one property patch field', () => {
    expect(propertyPatchSchema.safeParse({}).success).toBe(false)
  })

  it('accepts basic GeoJSON Polygon structures', () => {
    const geometry = geoJsonSchema.parse({ type: 'Polygon', coordinates: [] })
    expect(geometry.type).toBe('Polygon')
  })

  it('rejects malformed GeoJSON structures', () => {
    expect(geoJsonSchema.safeParse({ type: 'Polygon' }).success).toBe(false)
    expect(geoJsonSchema.safeParse({ type: 'FeatureCollection' }).success).toBe(false)
    expect(geoJsonSchema.safeParse({ type: 'Invalid', coordinates: [] }).success).toBe(false)
  })

  it('validates Field and Plot payloads without tenant identifiers', () => {
    const field = fieldCreateSchema.parse({ name: 'Área Norte', areaHa: 40, geometry: { type: 'Polygon', coordinates: [] } })
    const plot = plotCreateSchema.parse({ code: 'T-01', name: 'Talhão 01', areaHa: 12.5 })

    expect(field.name).toBe('Área Norte')
    expect(plot.code).toBe('T-01')
    expect('tenantId' in field).toBe(false)
    expect('tenantId' in plot).toBe(false)
  })
})
