declare module 'currency-symbol-map' {
    export const currencySymbolMap: { [currencyCode: string]: string | undefined };
    export default function getSymbolFromCurrency(currencyCode: string): string | undefined;
}