# Reglas de cálculo — extraídas de `COMPRA ORO LIQUIDACION.xlsx`

Fuente: hoja **COMPRA**. Hojas 2 y 3 están vacías.

## 1. Parámetros globales de la liquidación

| Celda | Concepto | Valor de ejemplo | Unidad |
|---|---|---|---|
| `D3` | **ONZA CIERRE** | 4867 | USD por onza troy |
| `F3` | **T/C** | 11.5 | Bs por USD |

Ambos son editables (marcados en verde en el original).
La nota del archivo dice: *"SOLO SE DEBEN EDITAR LOS CAMPOS MARCADOS EN VERDE"*.

## 2. Columnas del detalle

| Col | Encabezado | Origen |
|---|---|---|
| A | FECHA | manual |
| B | COMPRADOR | manual |
| C | **PESO A/F** — peso antes de fundir | manual |
| D | **PESO D/F** — peso después de fundir | manual |
| E | LEY | manual (ej. `0.87`) |
| F | COTIZACION | `= D3` (copia la onza cierre) |
| G | BS POR GRAMO | fórmula |
| H | TOTAL BS | fórmula |
| I | OBSERVACION | manual |

## 3. Fórmulas

### Bs por gramo

```
G7 = ((ONZA_CIERRE * LEY) / 31.1035) * TIPO_CAMBIO
G7 = (($D$3 * $E7) / 31.1035) * $F$3
```

`31.1035` = gramos por onza troy.

Comprobación con el ejemplo:

```
(4867 * 0.87) / 31.1035 * 11.5
= 4234.29 / 31.1035 * 11.5
= 136.1349 * 11.5
= 1565.5580561673123 Bs/g
```

### Total en bolivianos

```
H7 = PESO_D/F * BS_POR_GRAMO
```

```
49.2 * 1565.5580561673123 = 77025.456363431775 Bs
```

> **La ley se aplica dentro del precio por gramo, y el precio se multiplica por el
> peso BRUTO después de fundir (D/F), no por el peso fino.**
> Matemáticamente equivale a `peso_fino * precio_gramo_fino`, pero la presentación
> del negocio es "Bs por gramo bruto", y así debe mostrarse en pantalla.

### Merma de fundición (derivada, no está en el Excel)

```
merma = PESO_A/F - PESO_D/F
```

En el ejemplo `PESO A/F` está vacío, así que la merma no siempre se registra.

## 4. Implicaciones para el sistema

1. **Congelar la cotización por operación.**
   En el Excel, `F` apunta a `D3` con una referencia viva: cambiar la onza cierre
   **recalcula todas las filas históricas**, incluidas operaciones ya pagadas.
   Es un defecto del archivo, no una regla de negocio.
   En el sistema, cada compra guarda su propio `onza_cierre`, `tipo_cambio`,
   `ley` y `bs_por_gramo` como valores fijos al momento de confirmar.

2. **Precisión.**
   `31.1035` es constante. Todos los cálculos en `DECIMAL`.
   Redondeo (igual que el Excel): **solo se redondea el resultado final**.
   El Bs/gramo se muestra con 2 decimales, pero el total se calcula con el
   valor exacto: `49.2 × 1565.5580… = 77 025.46`, no `49.2 × 1565.56 = 77 025.55`.
   Redondear el precio antes de multiplicar desvía hasta ±5 Bs por kg.
   Totales a 2 decimales, pesos a 3.

5. **La venta usa la misma fórmula, con los valores del comprador.**
   El sitio donde se vende pone su onza, su T/C y mide su ley, y **paga en Bs**:
   `total_bs = peso × (onza × ley / 31.1035 × T/C)`, redondeado solo al final.
   El total en USD se guarda como referencia.

3. **La fundición ocurre dentro de la misma compra.**
   No requiere un proceso aparte: `PESO A/F` y `PESO D/F` son dos columnas de la
   misma fila. El módulo de Fundición del diseño original se simplifica a estos
   dos campos más la merma derivada.

4. **El Excel no contempla ventas.**
   Sólo registra compras/liquidación. El módulo de Ventas se diseñará por separado.
