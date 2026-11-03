type KitchenTicketItem = {
  id: string;
  item_name: string;
  quantity: number;
  options?: { name?: string }[];
  special_instructions?: string;
};

export type KitchenTicketOrder = {
  order_number: number;
  order_type: string;
  customer_name: string;
  branch_name: string;
  created_at: string;
  delivery_notes: string;
  items: KitchenTicketItem[];
};

function appendTextElement(document: Document, parent: HTMLElement, tag: string, text: string, className?: string): HTMLElement {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  parent.append(element);
  return element;
}

export function printKitchenTicket(printWindow: Window, order: KitchenTicketOrder, restaurantName: string | null): void {
  const document = printWindow.document;
  document.open();
  document.write('<!doctype html><html><head><meta charset="utf-8"><title>Kitchen ticket</title></head><body></body></html>');
  document.close();

  const style = document.createElement('style');
  style.textContent = `
    @page { size: 80mm auto; margin: 4mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #000; }
    body { width: 72mm; margin: 0 auto; font: 12px/1.35 Arial, sans-serif; }
    main { padding: 2mm 0; }
    header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 3mm; }
    .brand { font-size: 14px; font-weight: 700; }
    .ticket-label { margin-top: 2mm; font-size: 10px; font-weight: 700; letter-spacing: .12em; }
    .order-number { margin: 2mm 0 1mm; font-size: 22px; font-weight: 800; }
    .order-type { font-size: 14px; font-weight: 700; text-transform: uppercase; }
    .meta { display: grid; gap: 1mm; padding: 3mm 0; border-bottom: 1px dashed #000; }
    .items { list-style: none; margin: 0; padding: 2mm 0; border-bottom: 1px dashed #000; }
    .item { display: grid; grid-template-columns: 10mm 1fr; gap: 2mm; padding: 1.5mm 0; break-inside: avoid; }
    .quantity { font-size: 15px; font-weight: 800; }
    .item-name { font-size: 13px; font-weight: 700; overflow-wrap: anywhere; }
    .options { margin-top: 1mm; font-size: 11px; font-weight: 400; }
    .note { padding: 3mm 0; border-bottom: 1px dashed #000; white-space: pre-wrap; overflow-wrap: anywhere; }
    .note strong { display: block; margin-bottom: 1mm; }
    footer { padding-top: 3mm; text-align: center; font-size: 10px; }
  `;
  document.head.append(style);

  const main = document.createElement('main');
  document.body.append(main);
  const header = document.createElement('header');
  main.append(header);
  appendTextElement(document, header, 'div', restaurantName?.trim() || order.branch_name, 'brand');
  appendTextElement(document, header, 'div', 'KITCHEN TICKET', 'ticket-label');
  appendTextElement(document, header, 'div', `ORD-${String(order.order_number).padStart(5, '0')}`, 'order-number');
  appendTextElement(document, header, 'div', order.order_type.replaceAll('_', ' '), 'order-type');

  const meta = document.createElement('div');
  meta.className = 'meta';
  main.append(meta);
  appendTextElement(document, meta, 'div', `Customer: ${order.customer_name || 'Guest'}`);
  appendTextElement(document, meta, 'div', `Branch: ${order.branch_name}`);
  appendTextElement(document, meta, 'div', `Received: ${new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(order.created_at))}`);

  const items = document.createElement('ul');
  items.className = 'items';
  main.append(items);
  for (const item of order.items ?? []) {
    const row = document.createElement('li');
    row.className = 'item';
    items.append(row);
    appendTextElement(document, row, 'strong', `${item.quantity}×`, 'quantity');
    const details = document.createElement('div');
    row.append(details);
    appendTextElement(document, details, 'div', item.item_name, 'item-name');
    const options = item.options?.map(option => option.name?.trim()).filter((name): name is string => Boolean(name));
    if (options?.length) appendTextElement(document, details, 'div', options.join(', '), 'options');
    if (item.special_instructions?.trim()) appendTextElement(document, details, 'div', 'Note: ' + item.special_instructions.trim(), 'options');
  }

  if (order.delivery_notes.trim()) {
    const note = document.createElement('div');
    note.className = 'note';
    main.append(note);
    appendTextElement(document, note, 'strong', 'Special instructions');
    appendTextElement(document, note, 'div', order.delivery_notes);
  }

  appendTextElement(document, main, 'footer', 'Kitchen copy');
  printWindow.onafterprint = () => printWindow.close();
  printWindow.focus();
  printWindow.setTimeout(() => printWindow.print(), 150);
}
