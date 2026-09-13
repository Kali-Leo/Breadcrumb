/**
 * Purpose: types for `snowball-stemmers`, which ships one generated UMD file and no
 * declarations. Only the two entry points this repo uses are described; the generated stemmer
 * classes behind them are not public surface.
 */
declare module "snowball-stemmers" {
  export interface SnowballStemmer {
    stem(word: string): string;
  }
  export function newStemmer(language: string): SnowballStemmer;
  export function algorithms(): string[];
}
