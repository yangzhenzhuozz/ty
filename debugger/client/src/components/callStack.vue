<template>
    <div class="container" style="overflow: auto;height: 100%;">
        <div>
            <slot></slot>
        </div>
        <div>
            <table>
                <tbody>
                    <tr v-for="word, index in stack">
                        <td>0x{{ index.toString(16) }}</td>
                        <td>
                            {{ word }}
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</template>
<script lang="ts">
import { strPadding } from '@/Tools/numberTools';
import { defineComponent } from 'vue'
import type { PropType } from 'vue'
export default defineComponent({
    props: {
        stackBin: {
            type: Object as PropType<ArrayBuffer>,
            required: true
        }
    },
    computed: {
        stack(): string[] {
            let ret = [] as string[];
            let dv = new DataView(this.stackBin);
            for (let i = 0; i < this.stackBin.byteLength; i += 8) {
                ret.push(dv.getBigUint64(i, true).toString());
            }
            return ret;
        }
    }
});
</script>
<style scoped>
.container {
    border: solid 1px;
}

table {
    border-collapse: collapse;
    text-align: center;
}

th,
td {
    border: solid 1px;
    padding: 0px 10px;
}
</style>