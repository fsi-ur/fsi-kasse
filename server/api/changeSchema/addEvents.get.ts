import { defineEventHandler } from 'h3'
import { query } from '~/server/utils/db'
import { requirePermission } from '~/server/utils/api/guards'

export default defineEventHandler(async (event) => {
  const current = await requirePermission(event, 'cash_register.manage')
  if (!current.ok) return current

  const createTable = await query(`
    CREATE TABLE IF NOT EXISTS events (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)

  const addEventIdOrders = await query(`
    ALTER TABLE orders
      ADD COLUMN event_id BIGINT UNSIGNED AFTER fachschaft;
  `)

  const addEventIdOrdersForeignKey = await query(`
    ALTER TABLE orders
      ADD CONSTRAINT fk_orders_event
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;
  `)

  const addEventIdFachschaft = await query(`
    ALTER TABLE fachschaft_payments
      ADD COLUMN event_id BIGINT UNSIGNED AFTER cashier_id;
  `)

  const addEventIdFachschaftForeignKey = await query(`
    ALTER TABLE fachschaft_payments
      ADD CONSTRAINT fk_fachschaft_payments_event
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;
  `)

  const addWeihnachtsfeier = await query(`
    INSERT INTO events (name, is_active) VALUES ('Weihnachtsfeier', 1);
  `)

  const updateOrders = await query(`UPDATE orders SET event_id = 1;`)
  const updateOrderTable = await query(`ALTER TABLE orders MODIFY event_id BIGINT UNSIGNED NOT NULL;`)
  const updateFachschaft = await query(`UPDATE fachschaft_payments SET event_id = 1;`)
  const updateFachschaftTable = await query(`ALTER TABLE fachschaft_payments MODIFY event_id BIGINT UNSIGNED NOT NULL;`)

  return {
    ok: true,
    createTable,
    addEventIdOrders,
    addEventIdOrdersForeignKey,
    addEventIdFachschaft,
    addEventIdFachschaftForeignKey,
    addWeihnachtsfeier,
    updateOrders,
    updateOrderTable,
    updateFachschaft,
    updateFachschaftTable,
  }
})
