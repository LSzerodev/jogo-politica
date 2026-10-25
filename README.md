# Enquete 22 × 13 — jogo de live do TikTok

Os comentários, as curtidas e os presentes da sua live viram votos. Os placares, as mãos clicando, o ranking de quem mais votou e a música de quem está ganhando aparecem no jogo, que vai para o OBS.

## Como usar

1. Instale o **Node.js 20 ou mais novo** (versão LTS): https://nodejs.org
2. Dê dois cliques em **`INICIAR.bat`**. Na primeira vez ele instala o que falta, leva cerca de 1 minuto e precisa de internet. Depois o painel abre sozinho no navegador.
3. No **OBS**, crie uma fonte do tipo **Navegador**:
   - URL: `http://127.0.0.1:9595/jogo`
   - Largura `1080`, altura `1920`
   - Marque **"Controlar áudio pelo OBS"**, para a música e os áudios dos presentes irem para a live.
4. No **painel** (`http://127.0.0.1:9595`), coloque o seu @ e clique em **Conectar** quando estiver ao vivo.

Para parar, feche a janela preta do servidor.

## Como os votos funcionam

| O que acontece na live | Voto |
|---|---|
| Comentário com `22`, `flavio` ou `bolsonaro` | +1 no 22. A pessoa passa a ser do time 22. |
| Comentário com `13` ou `lula` | +1 no 13. A pessoa passa a ser do time 13. |
| Curtidas | A cada 10 curtidas, +1 para o time da pessoa |
| Presente da tabela (ex.: Rosa) | Os votos configurados × quantidade, para o time da pessoa ou sempre para um lado |
| Outro presente | 10 votos por moeda, para o time da pessoa |

Tudo isso se muda no painel: as palavras, os votos por comentário, as curtidas, os presentes e os áudios.

- **Presente de quem ainda não comentou um lado:** não conta, e o jogo avisa "comente 22 ou 13 para escolher seu lado". Se quiser que um presente sempre vá para um lado, escolha **Sempre o 22** ou **Sempre o 13** na regra dele.
- **Presente entre uma enquete e outra:** não se perde. Ele conta assim que a próxima começar.

## Presentes e áudios

No painel, em **Presentes**:

1. Escolha o presente na lista (Rosa, TikTok, GG, Coração de dedo, Rosquinha, Leão, Universo…) e clique em **Adicionar**. Se não estiver na lista, use "Outro" e digite o nome que o TikTok manda.
2. Defina **quantos votos cada um vale**. A Rosa já vem com 10.
3. Em **Áudio**, escolha qual som toca a cada vez que esse presente chegar, e ajuste o volume dele.
4. Use os botões **22** e **13** da linha para testar o presente.

Os presentes que chegam na live e ainda não têm regra aparecem como atalhos para criar a regra com um clique.

Os áudios ficam na pasta **`audios-presentes`**. Você pode adicionar pelo painel (arrastando os arquivos) ou copiando direto para a pasta.

## Música de quem está ganhando

- 22 na frente → toca o áudio da pasta `audio-quem-ta-ganhando\direita`
- 13 na frente → toca o áudio da pasta `audio-quem-ta-ganhando\esquerda`

Para trocar a música, troque o arquivo da pasta. Vale o primeiro arquivo em ordem alfabética.

## Pastas

```
INICIAR.bat                 inicia tudo (instala as dependências sozinho)
audio-quem-ta-ganhando\     músicas de quem está na frente
audios-presentes\           sons dos presentes
offline\                    versão demo que funciona sem servidor (só simulação)
server\                     servidor (painel, conexão com o TikTok, regras)
  data\settings.json        o que você salvou no painel
  data\server.log           histórico do que aconteceu
  .env                      porta (PORT) e proxy opcional (TIKTOK_PROXY)
```

## Problemas comuns

- **"a conta não está ao vivo agora"**: comece a live. O painel tenta de novo sozinho.
- **"esse @ não existe"**: confira o nome de usuário, sem espaços.
- **"o TikTok bloqueou a consulta"**: espere alguns minutos, ou configure `TIKTOK_PROXY` em `server\.env`.
- **Sem som no navegador**: clique em "ATIVAR SOM" no jogo. No OBS o som toca direto.
- **A porta 9595 já está em uso**: mude `PORT` em `server\.env`.
