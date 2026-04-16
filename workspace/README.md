# Workspace

Este diretório é utilizado pelo servidor CODEX-JSON-RPC como workspace para operações de arquivos.

## Estrutura

```
workspace/
├── .gitkeep          # arquivo placeholder
├── README.md         # este arquivo
└── [seus arquivos]   # os tools read_file/write_file operam aqui
```

## Tools que usam o workspace

- `read_file` - lê arquivos deste diretório
- `write_file` - escreve/sobrescreve arquivos aqui
- `append_file` - adiciona conteúdo ao final de arquivos
- `list_files` - lista diretórios e arquivos
- `delete_file` - remove arquivos

## Uso

 Todos os paths são relativos à raiz do workspace. Exemplo:

```json
{
  "tool": "write_file",
  "args": {
    "filepath": "notes.txt",
    "content": "Minhas anotações..."
  }
}
```

Isso cria `workspace/notes.txt`.

## Dica

O workspace é persistido via volume Docker (`./workspace:/workspace`), então os arquivos sobrevivem a reinicializações do container.
