# Modelo de carrera

El archivo versionado `modelo_carrera.json` es un Random Forest de 60 árboles
para estimar el tiempo de carrera a partir de un historial aportado
manualmente. Su formato es `raceestrategy-rf-logpace-v1`; el artefacto registra
`approved_for_beta=true` y un MAE de prueba de 6,1796 minutos. Esa métrica
describe el conjunto de prueba del entrenamiento y no garantiza el error de
cada predicción.

El modelo se entrenó/exportó fuera de la aplicación con datos FitRec. El
repositorio contiene el artefacto y la inferencia en `ml-predict.js`, pero no
el pipeline completo de entrenamiento ni el protocolo detallado de evaluación.
La API valida el formato y las variables esperadas y no permite inferencias
experimentales si el artefacto no figura como aprobado, salvo habilitación
local explícita.
