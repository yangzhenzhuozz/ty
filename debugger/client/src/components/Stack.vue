<template>
    <div class="container" style="overflow: auto;height: 100%;">
        <div>
            <slot></slot>
        </div>
        <div>
            <table>
                <tbody>
                    <tr v-for="word, index in stack"
                        :style="{ background: (index >= BP && index <= SP) ? 'red' : 'unset' }">
                        <td>0x{{ index.toString(16) }}</td>
                        <td>
                            0x{{ word }}
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
        },
        bp: {
            type: Object as PropType<number>,
            required: false
        },
        sp: {
            type: Object as PropType<number>,
            required: false
        },
    },
    computed: {
        stack(): string[] {
            let ret = [] as string[];
            let dv = new DataView(this.stackBin);
            for (let i = 0; i < this.stackBin.byteLength; i++) {
                ret.push(strPadding(dv.getUint8(i).toString(16), 2, '0'));
            }
            return ret;
        },
        BP() {
            if (this.bp != undefined) {
                return this.bp;
            } else {
                return -1;
            }
        },
        SP() {
            if (this.sp != undefined) {
                return this.sp;
            } else {
                return -1;
            }
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