-- Una multa nuova parte "da addebitare" (in attesa di assegnazione conducente
-- entro la soglia configurata), non più "non previsto" di default.
ALTER TABLE "Fine" ALTER COLUMN "riaddebito" SET DEFAULT 'DA_ADDEBITARE';
