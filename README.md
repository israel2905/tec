# TEC Games — Marketplace PLUS

Inclui:
- Admin **configurador** (marca, slogan e Pix) em `/admin.html`
- **Importação CSV** de produtos (title,category,price,description,vendorName)
- Checkout: Stripe, Mercado Pago, PagSeguro + Pix (client-side)
- Multi-vendedor (gera token em `/anunciar.html`)

## Rodar
```bash
npm i
cp .env.example .env
# edite .env (ADMIN_TOKEN e chaves de pagamento)
npm start
# http://localhost:3000/admin.html  (cole o ADMIN_TOKEN para salvar config/importar CSV)
# http://localhost:3000/index.html
```

## Dica de CSV
```
title,category,price,description,vendorName
Gift Card Steam R$100,Gift Cards,100.00,Código BR,Loja Alpha
Xbox Game Pass 3 meses,Assinaturas,69.90,Entrega digital,Loja Beta
Skin rara CS2 — Karambit,Itens,899.00,Estado novo,SkinsBR
```


## Contato do dono
E-mail: hunter.vinicoc@gmail.com
