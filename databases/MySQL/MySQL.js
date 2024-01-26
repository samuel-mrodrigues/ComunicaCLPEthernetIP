import MySQL from "mysql2/promise"
import { MySQLQuery } from "./Query.js";

export class InstanciaMySQL {

    #propriedades = {
        ip: '',
        usuario: '',
        senha: '',
        porta: 3006
    }

    #estado = {
        isConectando: false,
        isConectado: false
    }

    /**
     * @type {MySQL.Connection}
     */
    #conexaoMySQL;

    /**
     * 
     * @param {Object} propriedadesConexao 
     * @param {String} propriedadesConexao.ip - Endereço IP do servidor MySQL
     * @param {String} propriedadesConexao.usuario - Usuário do servidor MySQL
     * @param {String} propriedadesConexao.senha - Senha do servidor MySQL
     * @param {String} propriedadesConexao.porta - Porta do servidor MySQL
     */
    constructor(propriedadesConexao = this.#propriedades) {
        this.#propriedades = propriedadesConexao
    }

    /**
     * Tentar conectar-se ao servidor MySQL
     */
    async conectarBanco() {
        this.#estado = {
            isConectado: false,
            isConectando: true
        }

        let retornoConexao = {
            /**
             * Se a conexão foi estabelecida
             */
            sucesso: false,
            /**
             * Se a conexão não estabeleceu, contém os detalhes dos erros
             */
            erro: {
                motivo: '',
                descricao: ''
            }
        }

        const conexaoDados = {
            /**
             * @type {MySQL.Connection}
             */
            instanciaMySql: undefined,
            erroCatch: undefined
        }

        // Tentar conectar-se ao servidor
        try {
            conexaoDados.instanciaMySql = await MySQL.createConnection({
                user: this.#propriedades.usuario,
                password: this.#propriedades.senha,
                host: this.#propriedades.ip,
                port: this.#propriedades.porta,
                connectTimeout: 3000
            })

            this.#conexaoMySQL = conexaoDados.instanciaMySql;
        } catch (ex) {
            conexaoDados.erroCatch = ex;
        }

        // Se ocorreu erros durante a conexão inicial
        if (conexaoDados.erroCatch) {
            retornoConexao.sucesso = false;
            retornoConexao.erro.motivo = `${conexaoDados.erroCatch.code}`;
            retornoConexao.erro.descricao = conexaoDados.erroCatch.message;

            this.#estado.isConectando = false;
        } else {
            retornoConexao.sucesso = true;

            this.#estado = {
                isConectado: true,
                isConectando: false
            }
        }


        return retornoConexao;
    }

    /**
     * Retornar a conexão para realizar as consultas;
     */
    getConexao() {
        return this.#conexaoMySQL;
    }

    getExecutorQuery() {
        return new MySQLQuery(this.#conexaoMySQL);
    }

    isConectado() {
        return this.#estado.isConectado;
    }

    /**
     * Log de mensagem
     */
    log(msg) {
        console.log(`[MySQL ${this.#propriedades.ip}:${this.#propriedades.porta}] ${msg}`);
    }
}