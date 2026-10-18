import { filsToDecimal, milliToDecimal } from './money';

/**
 * Builds a UBL 2.1 invoice following the PINT AE (UAE Peppol) billing profile.
 *
 * This is the file an accredited service provider (Wafeq, in Phase 2) receives.
 * It has not yet been validated against the official PINT AE schematron; do that
 * when the Wafeq integration lands, before relying on it for submission.
 */

export interface PintInvoice {
  invoiceNumber: string;
  issueDate: string; // YYYY-MM-DD
  currency: string;
  supplier: {
    nameEn: string;
    trn: string | null;
    addressLine: string | null;
    city: string | null;
    emirate: string | null;
  };
  customer: {
    nameEn: string;
    trn: string | null;
    addressLine: string | null;
    city: string | null;
    emirate: string | null;
    phone: string | null;
  };
  note: string | null;
  lines: Array<{
    lineNo: number;
    description: string;
    quantityMilli: number;
    unitPriceFils: number;
    discountFils: number;
    netFils: number;
    vatRateBp: number;
    vatFils: number;
  }>;
  subtotalFils: number;
  vatFils: number;
  totalFils: number;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function el(tag: string, value: string | null | undefined, attrs = ''): string {
  if (value === null || value === undefined || value === '') return '';
  return `<${tag}${attrs ? ' ' + attrs : ''}>${esc(value)}</${tag}>`;
}

function percent(bp: number): string {
  return (bp / 100).toFixed(2);
}

/** UAE TIN is the first 10 digits of the 15-digit TRN; PINT AE uses it as the Peppol endpoint (scheme 0235). */
function tinFromTrn(trn: string | null): string | null {
  return trn && /^\d{15}$/.test(trn) ? trn.slice(0, 10) : null;
}

function party(p: PintInvoice['supplier'] & { phone?: string | null }): string {
  const tin = tinFromTrn(p.trn);
  return [
    '<cac:Party>',
    tin ? `<cbc:EndpointID schemeID="0235">${tin}</cbc:EndpointID>` : '',
    '<cac:PostalAddress>',
    el('cbc:StreetName', p.addressLine),
    el('cbc:CityName', p.city),
    el('cbc:CountrySubentity', p.emirate),
    '<cac:Country><cbc:IdentificationCode>AE</cbc:IdentificationCode></cac:Country>',
    '</cac:PostalAddress>',
    p.trn
      ? `<cac:PartyTaxScheme>${el('cbc:CompanyID', p.trn)}<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>`
      : '',
    `<cac:PartyLegalEntity>${el('cbc:RegistrationName', p.nameEn)}</cac:PartyLegalEntity>`,
    p.phone ? `<cac:Contact>${el('cbc:Telephone', p.phone)}</cac:Contact>` : '',
    '</cac:Party>',
  ].join('');
}

export function buildPintAeXml(inv: PintInvoice): string {
  const cur = `currencyID="${esc(inv.currency)}"`;
  const amt = (tag: string, fils: number) => `<${tag} ${cur}>${filsToDecimal(fils)}</${tag}>`;

  // One tax subtotal per VAT rate.
  const byRate = new Map<number, { taxable: number; tax: number }>();
  for (const l of inv.lines) {
    const g = byRate.get(l.vatRateBp) ?? { taxable: 0, tax: 0 };
    g.taxable += l.netFils;
    g.tax += l.vatFils;
    byRate.set(l.vatRateBp, g);
  }
  const category = (bp: number) => (bp > 0 ? 'S' : 'Z');

  const taxSubtotals = [...byRate.entries()]
    .map(
      ([bp, g]) =>
        `<cac:TaxSubtotal>${amt('cbc:TaxableAmount', g.taxable)}${amt('cbc:TaxAmount', g.tax)}` +
        `<cac:TaxCategory><cbc:ID>${category(bp)}</cbc:ID><cbc:Percent>${percent(bp)}</cbc:Percent>` +
        `<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal>`,
    )
    .join('');

  const lines = inv.lines
    .map((l) => {
      const allowance =
        l.discountFils > 0
          ? `<cac:AllowanceCharge><cbc:ChargeIndicator>false</cbc:ChargeIndicator>` +
            `<cbc:AllowanceChargeReason>Discount</cbc:AllowanceChargeReason>${amt('cbc:Amount', l.discountFils)}</cac:AllowanceCharge>`
          : '';
      return (
        `<cac:InvoiceLine><cbc:ID>${l.lineNo}</cbc:ID>` +
        `<cbc:InvoicedQuantity unitCode="C62">${milliToDecimal(l.quantityMilli)}</cbc:InvoicedQuantity>` +
        amt('cbc:LineExtensionAmount', l.netFils) +
        allowance +
        `<cac:TaxTotal>${amt('cbc:TaxAmount', l.vatFils)}</cac:TaxTotal>` +
        `<cac:Item>${el('cbc:Name', l.description)}` +
        `<cac:ClassifiedTaxCategory><cbc:ID>${category(l.vatRateBp)}</cbc:ID><cbc:Percent>${percent(l.vatRateBp)}</cbc:Percent>` +
        `<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item>` +
        `<cac:Price>${amt('cbc:PriceAmount', l.unitPriceFils)}</cac:Price>` +
        `</cac:InvoiceLine>`
      );
    })
    .join('');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"',
    ' xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"',
    ' xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">',
    '<cbc:CustomizationID>urn:peppol:pint:billing-1@ae-1</cbc:CustomizationID>',
    '<cbc:ProfileID>urn:peppol:bis:billing</cbc:ProfileID>',
    // Transaction type flags (free zone, deemed supply, margin scheme, ...): none apply to garage repairs.
    '<cbc:ProfileExecutionID>00000000</cbc:ProfileExecutionID>',
    el('cbc:ID', inv.invoiceNumber),
    el('cbc:IssueDate', inv.issueDate),
    '<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>',
    el('cbc:Note', inv.note),
    el('cbc:DocumentCurrencyCode', inv.currency),
    el('cbc:TaxCurrencyCode', inv.currency),
    `<cac:AccountingSupplierParty>${party(inv.supplier)}</cac:AccountingSupplierParty>`,
    `<cac:AccountingCustomerParty>${party(inv.customer)}</cac:AccountingCustomerParty>`,
    `<cac:Delivery><cbc:ActualDeliveryDate>${esc(inv.issueDate)}</cbc:ActualDeliveryDate></cac:Delivery>`,
    `<cac:TaxTotal>${amt('cbc:TaxAmount', inv.vatFils)}${taxSubtotals}</cac:TaxTotal>`,
    '<cac:LegalMonetaryTotal>',
    amt('cbc:LineExtensionAmount', inv.subtotalFils),
    amt('cbc:TaxExclusiveAmount', inv.subtotalFils),
    amt('cbc:TaxInclusiveAmount', inv.totalFils),
    amt('cbc:PayableAmount', inv.totalFils),
    '</cac:LegalMonetaryTotal>',
    lines,
    '</Invoice>',
  ].join('\n');
}
