import MySQL from "mysql2"

export class MySQLQuery {
    /**
     * @type {MySQL.Connection}
     */
    #conexaoMySQL;

    constructor(isntanciaConexao) {
        this.#conexaoMySQL = isntanciaConexao;
    }

    async executar(sql) {
        const retornoExecucao = {
            sucesso: false,
            resultado: [],
            erro: ''
        }
        try {
            let queryRequest = await this.#conexaoMySQL.query(sql)

            retornoExecucao.sucesso = true
            retornoExecucao.resultado = queryRequest[0]
            return retornoExecucao
        } catch (erro) {
            retornoExecucao.erro = erro

            return retornoExecucao;
        }
    }
}