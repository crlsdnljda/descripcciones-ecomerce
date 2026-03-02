export const FOOTWEAR_CATEGORIES = new Set([
  "alpargatas", "bailarinas", "botas", "botas de agua", "botas de fútbol",
  "botines", "calzado respetuoso", "chanclas", "mocasines", "náuticos",
  "sandalias", "sneakers", "zapatillas", "zapatillas con luces",
  "zapatillas de casa", "zapatos", "zapatos bebé", "zapatos deportivos",
  "zapatos respetuosos bebe", "zuecos",
]);

export function isFootwear(categoria: string | null | undefined): boolean {
  if (!categoria) return false;
  return FOOTWEAR_CATEGORIES.has(categoria.toLowerCase().trim());
}
