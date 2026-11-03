import { useState } from 'react';
import { printKitchenTicket, type KitchenTicketOrder } from './kitchenTicketPrinter';
import './kitchen-ticket-preview.css';

type Props = {
  order: KitchenTicketOrder;
  restaurantName: string | null;
  onClose: () => void;
};

function orderTypeLabel(value: string): string {
  const labels: Record<string, string> = {
    delivery: 'Delivery',
    take_out: 'Take-out',
    pickup: 'Pick-up',
    dine_in: 'Dine-in',
  };
  return labels[value] ?? value.replaceAll('_', ' ');
}

export function KitchenTicketPreview({ order, restaurantName, onClose }: Props) {
  const [printError, setPrintError] = useState('');
  const receivedAt = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(order.created_at));

  function print() {
    let printWindow: Window | null = null;
    try { printWindow = window.open('', '_blank', 'popup,width=440,height=720'); }
    catch { printWindow = null; }
    if (!printWindow) {
      setPrintError('Allow pop-ups for this site, then try printing again.');
      return;
    }
    try {
      printKitchenTicket(printWindow, order, restaurantName);
      setPrintError('');
    } catch {
      printWindow.close();
      setPrintError('The print preview could not be opened. Please try again.');
    }
  }

  return <div className="staff-kitchen-ticket-preview-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="staff-kitchen-ticket-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="staff-kitchen-ticket-preview-title">
      <header className="staff-kitchen-ticket-preview-heading">
        <div><p>ORDER SENT TO KITCHEN</p><h2 id="staff-kitchen-ticket-preview-title">Receipt preview</h2></div>
        <button type="button" className="staff-kitchen-ticket-preview-close" aria-label="Close receipt preview" onClick={onClose}>×</button>
      </header>
      <article className="staff-kitchen-ticket-paper">
        <header>
          <strong className="staff-kitchen-ticket-brand">{restaurantName?.trim() || order.branch_name}</strong>
          <span className="staff-kitchen-ticket-label">KITCHEN TICKET</span>
          <strong className="staff-kitchen-ticket-number">ORD-{String(order.order_number).padStart(5, '0')}</strong>
          <strong className="staff-kitchen-ticket-type">{orderTypeLabel(order.order_type)}</strong>
        </header>
        <div className="staff-kitchen-ticket-meta">
          <span>Customer: {order.customer_name || 'Guest'}</span>
          <span>Branch: {order.branch_name}</span>
          <span>Received: {receivedAt}</span>
        </div>
        <ul className="staff-kitchen-ticket-items">{(order.items ?? []).map(item => <li key={item.id}>
          <strong>{item.quantity}×</strong>
          <span>{item.item_name}{item.options?.length ? <small>{item.options.map(option => option.name).filter(Boolean).join(', ')}</small> : null}{item.special_instructions&&<small>Note: {item.special_instructions}</small>}</span>
        </li>)}</ul>
        {order.delivery_notes.trim() && <div className="staff-kitchen-ticket-note"><strong>Special instructions</strong><span>{order.delivery_notes}</span></div>}
        <footer>Kitchen copy</footer>
      </article>
      {printError && <p className="staff-kitchen-ticket-preview-error" role="alert">{printError}</p>}
      <footer className="staff-kitchen-ticket-preview-actions">
        <button className="staff-button staff-button-secondary" type="button" onClick={onClose}>Close</button>
        <button className="staff-button staff-button-primary" type="button" onClick={print}>Print ticket</button>
      </footer>
    </section>
  </div>;
}
