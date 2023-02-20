<template>
    <div style="overflow: auto;height: 100%;" ref="tableContainer">
        <table>
            <thead>
                <tr>
                    <th>index</th>
                    <th>opCode</th>
                    <th>operand1</th>
                    <th>operand2</th>
                    <th>operand3</th>
                </tr>
            </thead>
            <tbody>
                <template v-for="(instruction, index) in text">
                    <tr>
                        <td v-if="irTable.has(index.toString())" colspan="5" style="text-align: start;">{{
                            irTable.get(index.toString())
                        }}
                        </td>
                    </tr>
                    <tr :class="{ 'active-instruction': pc == index }" @click="$emit('update:pc', index)"
                        :ref="'i' + index">
                        <td>{{ index }}</td>
                        <td>{{ instruction.opCode }}</td>
                        <td>{{ instruction.operand1 }}</td>
                        <td>{{ instruction.operand2 }}</td>
                        <td>{{ instruction.operand3 }}</td>
                    </tr>
                </template>
            </tbody>
        </table>
    </div>
</template>
<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'

export default defineComponent({
    emits: {
        'update:pc': (payload: number) => {
            // 执行运行时校验
            return true;
        }
    },
    props: {
        text: {
            type: Object as PropType<any[]>,
            required: true
        },
        stringPool: {
            type: Object as PropType<string[]>,
            required: true
        },
        irTable: {
            type: Object as PropType<Map<string, string>>,
            required: true
        },
        pc: {
            type: Number,
            required: true
        }
    },
    watch: {
        pc: {
            handler(val, oldVal) {
                if (val != -1) {
                    if (
                        ((this.$refs['i' + val] as HTMLElement[])[0]).offsetTop - (this.$refs.tableContainer as HTMLDivElement).scrollTop < 0 ||
                        ((this.$refs['i' + val] as HTMLElement[])[0]).offsetTop - (this.$refs.tableContainer as HTMLDivElement).scrollTop > (this.$refs.tableContainer as HTMLDivElement).clientHeight
                    ) {
                        ((this.$refs['i' + val] as HTMLElement[])[0]).scrollIntoView();
                    }
                }
            },
            immediate: false
        }
    }
})
</script>
<style scoped>
table {
    border-collapse: collapse;
    text-align: center;
}

th,
td {
    border: solid 1px;
    padding: 0px 10px;
}

.active-instruction {
    background-color: red;
}
</style>