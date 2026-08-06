import { X } from '@phosphor-icons/react';

export function Modal({ open, title, children, onClose, actions }) {
  if (!open) return null;
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal" role="dialog" aria-modal="true" aria-label={title}><header><strong>{title}</strong><button className="icon-button" onClick={onClose} aria-label="关闭"><X /></button></header><div className="modal-body">{children}</div>{actions ? <footer>{actions}</footer> : null}</section></div>;
}
