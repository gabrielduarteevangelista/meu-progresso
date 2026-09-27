# Meu Progresso — peso e medidas

App (PWA) de acompanhamento semanal de peso (kg) e medidas (cm): cintura, quadril, coxa e braço.
Funciona offline, instala na tela inicial do Android e guarda os dados só no aparelho.

## Publicar no GitHub Pages (uma vez só)

1. Entre em https://github.com (crie uma conta gratuita se ainda não tiver).
2. Clique em **New repository** (botão verde "New").
   - Nome: `meu-progresso`
   - Marque **Public** (o GitHub Pages gratuito exige repositório público; seus **dados não vão para lá**, só o código do app).
   - Clique em **Create repository**.
3. Na página do repositório, clique em **uploading an existing file**.
4. Arraste **todo o conteúdo desta pasta** (index.html, app.js, styles.css, sw.js, manifest.webmanifest e a pasta `icons`) e clique em **Commit changes**.
5. Vá em **Settings → Pages**. Em *Branch*, escolha `main` e a pasta `/ (root)`, e clique em **Save**.
6. Aguarde 1–2 minutos. O endereço aparece no topo da página, no formato:
   `https://SEU-USUARIO.github.io/meu-progresso/`

## Instalar no celular Android

1. Abra o endereço acima no **Chrome** do celular.
2. Toque no menu **⋮** → **Instalar app** (ou "Adicionar à tela inicial").
3. O ícone "Progresso" aparece na tela inicial e abre como um app.

## Lembrete semanal

- **Ajustes → Lembrete no celular**: ative e permita as notificações. Com o app instalado, o Chrome avisa
  na sexta-feira se você ainda não registrou. (O Android decide o horário exato do aviso.)
- **Ajustes → Adicionar lembrete à agenda**: baixa um evento semanal (sexta, às 7h) para a sua agenda.
  É o lembrete mais confiável.

## Backup

Os dados ficam só no navegador do celular. Use **Ajustes → Exportar backup** de vez em quando e guarde o
arquivo (Google Drive, e-mail etc.). Para restaurar em outro aparelho: **Ajustes → Importar backup**.
Também dá para exportar uma planilha (.csv) para abrir no Excel ou no Planilhas Google.

## Atualizar o app depois

Se alterar algum arquivo, envie de novo para o repositório e aumente a versão em `sw.js`
(`meuprogresso-v1` → `meuprogresso-v2`) para que os celulares baixem a versão nova.
