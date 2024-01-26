import { InstanciaMySQL } from "./databases/MySQL/MySQL.js";
const bancoTeste = new InstanciaMySQL({
    ip: '192.168.1.10',
    usuario: 'root',
    senha: 'root'
})

await bancoTeste.conectarBanco();
import NodeDrivers from "node-drivers";


console.log(`Iniciando...`);

let idsetIntervalRecolheDados = -1;
let isRecolhendoDados = false;
let dispositivos = ['192.168.3.120']



async function recolherDadosDispositivos() {
    if (isRecolhendoDados) {
        console.log(`Recolhimento de dados já ativo!`);
        return
    }

    isRecolhendoDados = true;

    console.log(`Iniciando a coleta de dados de ${dispositivos.length} dispositivo(s) configurados.`);
    for (const dispositivoIP of dispositivos) {
        console.log(`Obtendo informações do dispositivo ${dispositivoIP}...`);

        const log = (msg) => {
            console.log(`[CLP ${dispositivoIP}]: ${msg}`);
        }

        const tcpIp = new NodeDrivers.TCP(dispositivoIP)
        const clp = new NodeDrivers.CIP.Logix5000(tcpIp);

        console.log(`Analisando lista de tags...`);
        /**
         * Tags que devem ser observadas
         * @type {{tag: String, nomeTabela: String, nomeCampo: String}[]}
         */
        const tagsParaObservar = []
        for await (const tag of clp.listTags()) {
            // Verificar se a tag contém o inicio pra ser observar
            if (tag.name.toLowerCase().indexOf('bd') != -1) {

                const tagSplitada = tag.name.split("_");
                if (tagSplitada[0] != 'BD') continue;

                // Identificador depois do BD_%identificador%
                const nomeTabela = tagSplitada[1];

                // Nome do campo depois do BD_%identificador%_%nomeCampo%
                const nomeCampo = tagSplitada.splice(2, 99).join('_');

                tagsParaObservar.push({
                    tag: tag.name,
                    nomeCampo: nomeCampo,
                    nomeTabela: nomeTabela
                })
            }
        }

        console.log(tagsParaObservar);

        // Se houver tags para serem observadas
        if (tagsParaObservar.length != 0) {

            /**
             * @type {{tabelaNome: String, campos: [{nome: String, valor: String}]}[]}
             */
            const alteracoesNoBanco = []
            log(`Encontrado ${tagsParaObservar.length} tags para sincronizar com o banco de dados`);

            // Passar por cada tag analisada
            for (const tagParaColetar of tagsParaObservar) {
                log(`Lendo dados da tag ${tagParaColetar.tag}`);

                let statusLeuTag = {
                    sucesso: false,
                    valor: undefined
                }

                // Ler a tag
                try {
                    statusLeuTag.valor = await clp.readTag(tagParaColetar.tag);
                    statusLeuTag.sucesso = true;
                } catch (ex) {
                    log(`Erro ao ler a tag ${tagParaColetar.tag}: ${ex.message}`);

                    if (tagParaColetar.tag == 'BD_G1_TESTELEGAL') {
                        statusLeuTag.sucesso = true;
                        statusLeuTag.valor = '666';
                    } else {
                        continue;
                    }
                }

                // Se a tabela já foi adicionado anteriormente
                const jaAdicionado = alteracoesNoBanco.find(tabelaObj => tabelaObj.tabelaNome == tagParaColetar.nomeTabela);
                if (jaAdicionado) {
                    jaAdicionado.campos.push({
                        nome: tagParaColetar.nomeCampo,
                        valor: statusLeuTag.valor
                    })
                } else {
                    alteracoesNoBanco.push({
                        tabelaNome: tagParaColetar.nomeTabela,
                        campos: [{
                            nome: tagParaColetar.nomeCampo,
                            valor: statusLeuTag.valor
                        }]
                    })
                }
            }

            log(`Inicializando as atualizações no banco. Segue os dados que serão atualizados:`)
            console.log(alteracoesNoBanco);

            for (const alteracoesTabela of alteracoesNoBanco) {
                log(`Atualizando tabela ${alteracoesTabela.tabelaNome} no banco de dados...`);

                if (!bancoTeste.isConectado()) {
                    log(`Sem conexão com o banco de dados no momento, não salvando dados...`);
                    continue;
                }

                const executorQuery = bancoTeste.getExecutorQuery();

                const usarBancoTeste = await executorQuery.executar('USE fundicao_clps;');
                if (!usarBancoTeste.sucesso) {
                    log(`Não foi possível definir o banco ativo, não salvando dados... Motivo: ${usarBancoTeste.erro}`);
                }

                const statusExisteTabela = await executorQuery.executar(`
                SELECT *
                FROM information_schema.tables
                WHERE table_schema = 'fundicao_clps' AND table_name = '${alteracoesTabela.tabelaNome}';
                `)

                if (!statusExisteTabela.sucesso) {
                    log(`Não foi possível validar se a tabela da tag existe, não salvando dados.... Motivo: ${statusExisteTabela.erro}`)
                }

                // Se a tabela não existir
                if (statusExisteTabela.resultado.length == 0) {

                    // Criar a tabela
                    log(`Criando tabela inexistente: ${alteracoesTabela.tabelaNome}`)

                    let sqlCriaTabela = `
                    CREATE TABLE ${alteracoesTabela.tabelaNome} (
                        id INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
                        data_inclusao DATETIME NOT NULL,
                    `

                    let primeiro = true;
                    alteracoesTabela.campos.forEach(campo => {
                        if (!primeiro) sqlCriaTabela += `, `
                        sqlCriaTabela += `${campo.nome} VARCHAR(255) NOT NULL`
                        primeiro = false;
                    })

                    sqlCriaTabela += `);`

                    const statusSolicitaCriar = await executorQuery.executar(sqlCriaTabela);
                    if (!statusSolicitaCriar.sucesso) {
                        log(`Não foi possível criar a tabela ${alteracoesTabela.tabelaNome}, não salvando dados... Motivo: ${statusSolicitaCriar.erro}`);
                        continue;
                    }

                    log(`Criação da tabela concluida com sucesso`)
                }

                // Verificar se os campos existem
                for (const campoParaVerificar of alteracoesTabela.campos) {
                    const statusExisteCampo = await executorQuery.executar(`
                    SELECT *
                    FROM information_schema.columns
                    WHERE table_schema = 'fundicao_clps' AND table_name = '${alteracoesTabela.tabelaNome}' AND column_name = '${campoParaVerificar.nome}';
                    `)

                    if (!statusExisteCampo.sucesso) {
                        log(`Não foi possível validar se o campo ${campoParaVerificar.nome} existe, não salvando dados.... Motivo: ${statusExisteCampo.erro}`)
                        continue;
                    }

                    // Se o campo não existir
                    if (statusExisteCampo.resultado.length == 0) {
                        log(`Criando campo inexistente: ${campoParaVerificar.nome}`)

                        const statusSolicitaCriar = await executorQuery.executar(`
                        ALTER TABLE ${alteracoesTabela.tabelaNome} ADD ${campoParaVerificar.nome} VARCHAR(255) NOT NULL;
                        `)

                        if (!statusSolicitaCriar.sucesso) {
                            log(`Não foi possível criar o campo ${campoParaVerificar.nome}, não salvando dados... Motivo: ${statusSolicitaCriar.erro}`);
                            continue;
                        }

                        log(`Criação do campo concluida com sucesso`)
                    }
                }

                // Com todas as verificações realizadas, inserir a informação no banco de dados
                let instrucaoInsert = `INSERT INTO ${alteracoesTabela.tabelaNome} (data_inclusao, `

                // Adicionar as tabelas que vão no insert
                let primeiro = true;
                for (const campoParaInserir of alteracoesTabela.campos) {
                    if (!primeiro) instrucaoInsert += `, `;

                    instrucaoInsert += `${campoParaInserir.nome}`
                    primeiro = false;
                }

                primeiro = true;

                const dataAgora = new Date()
                instrucaoInsert += `) VALUES ('${dataAgora.getFullYear()}-${(dataAgora.getMonth() + 1).toString().padStart(2, '0')}-${dataAgora.getDate().toString().padStart(2, '0')} ${dataAgora.getHours().toString().padStart(2, '0')}:${dataAgora.getMinutes().toString().padStart(2, '0')}:${dataAgora.getSeconds().toString().padStart(2, '0')}', `
                for (const campoValorInserir of alteracoesTabela.campos) {
                    if (!primeiro) instrucaoInsert += `, `;
                    instrucaoInsert += `'${campoValorInserir.valor}'`
                    primeiro = false;
                }

                instrucaoInsert += `)`;

                const statusSolicitaInsert = await executorQuery.executar(instrucaoInsert);
                if (!statusSolicitaInsert.sucesso) {
                    log(`Não foi possível inserir os dados no banco de dados, não salvando dados... Motivo: ${statusSolicitaInsert.erro}`);
                    continue;
                } else {
                    log(`Insert de dados concluido com sucesso`)
                }
            }
        } else {
            log(`Nenhuma TAG para sincronizar com o servidor...`);
        }
    }

    console.log(`Coleta de dados concluida com sucesso`);
    isRecolhendoDados = false;
}

function iniciarSetinterval() {
    clearInterval(idsetIntervalRecolheDados);

    idsetIntervalRecolheDados = setInterval(() => {
        console.log(`Executando tarefa de recolher dados...`);
        recolherDadosDispositivos();
    }, 60000);
}

// recolherDadosDispositivos();
iniciarSetinterval();