<template>
  <div style="display: flex;flex-direction: column;overflow: hidden;height: 100%;width: 100%;">
    <div class="cmdBox" ref="stdoutBox">
      <div v-for="msg in stdout">{{ msg }}</div>
    </div>
    <div class="cmdBox" ref="cmdBox">
      <div v-for="history in histories">{{ history }}</div>
    </div>
    <input v-model="cmd" @keydown.enter="(event) => { send(cmd); cmd = ''; }"
      @keydown.up="cmd = histories[histories.length - 1]" />
    <div style="display: flex;align-items: start;flex-grow: 0;overflow: auto;">
      <InstructionList style="flex-shrink:0;" :text="text" :string-pool="stringPool" :irTable="irTable" :pc="pc"
        @update:pc="(v) => pc = v" />
      <Stack style="flex-shrink:0;" :stackBin="calculateStack">calculateStack</Stack>
      <Stack style="flex-shrink:0;" :stackBin="unwindNumStack">unwindNumStack</Stack>
      <Stack style="flex-shrink:0;" :stackBin="unwindHandlerStack">unwindHandlerStack</Stack>
      <Stack style="flex-shrink:0;" :stackBin="varStack" :bp="bp" :sp="sp">varStack</Stack>
      <CallStack style="flex-shrink:0;" :stackBin="callStack">callStack</CallStack>
    </div>
  </div>
</template>
<script lang="ts">
import { defineComponent } from 'vue'
import InstructionList from '@/components/InstructionTable.vue'
import Stack from '@/components/Stack.vue'
import CallStack from '@/components/callStack.vue'

export default defineComponent({
  components: {
    InstructionList: InstructionList,
    Stack: Stack,
    CallStack: CallStack
  },
  data() {
    return {
      websocket: undefined as WebSocket | undefined,
      text: [] as any[],
      stringPool: [] as string[],
      nativeTable: [] as { name: string, argSizeList: number[], retSize: number }[],
      irTable: new Map<string, string>(),
      typeTable: [] as {
        name: string,
        desc: 'PlaintObj' | 'Array' | 'Function',
        innerType: string
      }[],
      lastCmd: '',
      stackFrameTable: [] as { baseOffset: number, autoUnwinding: number, size: number, isFunctionBlock: boolean, isTryBlock: boolean, props: { name: number, type: number }[] }[],
      calculateStack: new ArrayBuffer(0),
      callStack: new ArrayBuffer(0),
      varStack: new ArrayBuffer(0),
      frameStack: new ArrayBuffer(0),
      unwindNumStack: new ArrayBuffer(0),
      unwindHandlerStack: new ArrayBuffer(0),
      pc: -1,
      bp: 0,
      sp: 0,
      cmd: "",
      histories: [] as string[],
      stdout: [] as string[]
    }
  },
  created() {
    this.initWebScoket();
  },
  computed: {},
  mounted() {
    this.loadDebugSymbol();
  },
  methods: {
    async loadDebugSymbol() {
      this.stringPool = await (await fetch(`http://localhost:10087/data/stringPool.json`)).json();
      this.nativeTable = await (await fetch(`http://localhost:10087/data/nativeTable.json`)).json();
      this.stackFrameTable = await (await fetch(`http://localhost:10087/data/stackFrameTable.json`)).json();
      this.typeTable = (await (await fetch(`http://localhost:10087/data/typeTable.json`)).json()).map((v: any) => {
        let desc;
        switch (v.desc) {
          case 0: desc = 'PlaintObj'; break;
          case 1: desc = 'Array'; break;
          case 2: desc = 'Function'; break;
          default: desc = 'unknow'; break;
        }
        return {
          name: this.stringPool[v.name],
          desc
        };
      });
      let primitiveIRTable = (await (await fetch(`http://localhost:10087/data/irTable.json`)).json());
      this.irTable = new Map<string, string>();
      for (let item of primitiveIRTable) {
        this.irTable.set(item[1], item[0]);
      }
      this.text = (await (await fetch(`http://localhost:10087/data/text.json`)).json()).map((v: any) => {
        switch (v.opCode) {
          case 'push_stack_map':
            v.operand1 = `${v.operand1} frameSize:${this.stackFrameTable[v.operand1].size}`;
            break;
          case '_new':
            v.operand1 = this.typeTable[v.operand1].name;
            break;
          case '_throw':
            v.operand1 = this.typeTable[v.operand1].name;
            break;
          case 'push_catch_block':
            v.operand2 = this.typeTable[v.operand2].name;
            break;
          case 'instanceof':
            v.operand1 = this.typeTable[v.operand1].name;
            break;
          case 'const_double_load':
            let buffer = new ArrayBuffer(8);
            let dv = new DataView(buffer);
            dv.setBigInt64(0, BigInt(v.operand1), true);
            v.operand1 = `${dv.getFloat64(0, true)}`;
            break;
          case 'native_call':
            v.operand1 = this.nativeTable[v.operand1].name;
            break;
          case 'box':
            v.operand1 = this.typeTable[v.operand1].name;
            break;
          case 'unbox':
            v.operand1 = this.typeTable[v.operand1].name;
            break;
          case 'abs_call':
          case 'construct_call':
            v.operand1 = `${v.operand1} ${this.irTable.get(v.operand1)}`;
            break;
          case 'newArray':
            v.operand1 = this.typeTable[v.operand1].name;
            break;
          default: break;
        }
        return v;
      });
    },
    send(msg: string) {
      if (this.websocket) {
        if (msg == '') {
          msg = this.histories[this.histories.length - 1];
        }
        this.websocket.send((new TextEncoder()).encode(msg));
        console.log(`send:${msg}`);
        this.histories.push(msg);
        this.$nextTick(() => {
          (this.$refs.cmdBox as HTMLDivElement).scrollTop = (this.$refs.cmdBox as HTMLDivElement).scrollHeight;
        });
      }
    },
    initWebScoket() {
      this.websocket = new WebSocket(`ws://localhost:10087/command`);
      this.websocket.onclose = () => {
        this.websocket = undefined;
      };
      this.websocket.onmessage = async (message) => {
        let data: string;
        if (typeof (message.data) == 'string') {
          data = message.data;
          console.log(`receive:${data}`);
          this.lastCmd = data;
          if (data == 'update_file') {
            console.log(`更新调试文件`);
            this.loadDebugSymbol();
          } else if ((data as string).match(/debugger:.*/)) {
            this.stdout.push(data.slice(9));
            this.$nextTick(() => {
              (this.$refs.cmdBox as HTMLDivElement).scrollTop = (this.$refs.cmdBox as HTMLDivElement).scrollHeight;
            });
          } else if ((data as string).match(/update pc (\d+)/)) {
            this.pc = Number(/update pc (\d+)/.exec((data as string))![1]);
          } else if ((data as string).match(/update bp (\d+)/)) {
            this.bp = Number(/update bp (\d+)/.exec((data as string))![1]);
          } else if ((data as string).match(/update sp (\d+)/)) {
            this.sp = Number(/update sp (\d+)/.exec((data as string))![1]);
          } else if (data == '__exit') {
            this.pc = -1;
          }
        } else {
          console.log(`receive binary`);
          switch (this.lastCmd) {
            case 'update calculate stack':
              this.calculateStack = await (message.data as Blob).arrayBuffer();
              break;
            case 'update call stack':
              this.callStack = await (message.data as Blob).arrayBuffer();
              break;
            case 'update var stack':
              this.varStack = await (message.data as Blob).arrayBuffer();
              break;
            case 'update frame stack':
              this.frameStack = await (message.data as Blob).arrayBuffer();
              break;
            case 'update unwindhandler stack':
              this.unwindHandlerStack = await (message.data as Blob).arrayBuffer();
              break;
            case 'update unwindnum stack':
              this.unwindNumStack = await (message.data as Blob).arrayBuffer();
              break;
          }
        }
      };
    }
  }
})
</script>
<style scoped>
.cmdBox {
  height: 8rem;
  flex-shrink: 0;
  overflow: auto;
  margin: 0 5px;
  border: solid 1px red;
  background-color: black;
  color: white;
}
</style>